import crypto from "crypto";
import { existsSync, mkdirSync } from "fs";
import fs, { rm } from "fs/promises";
import hcloud from "hcloud-sdk";
import { Engine, EngineRegistry, WaveEngine } from "hcloud-sdk/lib/interfaces/high5/wave";
import { dump, load } from "js-yaml";
import { homedir } from "os";
import path from "path";
import * as tar from "tar";
import { getConfig, loadConfig } from "../config/ConfigReader";
import { setWaveEngineFolder } from "../utils/folders";
import { downloadFile } from "./DownloadHelper";

class EngineManager {
    private folderName = "engines";
    private baseEngineFolder: string;
    private version: string | undefined;
    private metadataFile = "index.yaml";

    constructor(engineVersion?: string) {
        this.version = engineVersion;
        this.baseEngineFolder = path.join(homedir(), ".hcloud", "framework");
        this.createBaseEngineFolder();
    }

    private async createBaseEngineFolder(): Promise<void> {
        try {
            await fs.mkdir(this.baseEngineFolder, {
                recursive: true,
            });
        } catch (error) {
            console.error(`Can not create engines folder: '${String(error)}`);
            const stat = await fs.stat(this.baseEngineFolder);
            if (!stat.isDirectory()) throw new Error(`Unable to create engine folder. A file already exists with the same path. ${this.baseEngineFolder}`);
        }
    }

    private getEnginePath(md5: string): string | null {
        const enginePath = path.join(this.baseEngineFolder, this.folderName, md5, "build", "index.js");
        return existsSync(enginePath) ? enginePath : null;
    }

    private async downloadEngine(fileUrl: string, outputLocationPath: string, md5: string): Promise<void> {
        await downloadFile(fileUrl, outputLocationPath);
        await this.isMd5Match(md5, outputLocationPath, true);
    }

    private async unPackEngine(enginePath: string, outputLocationPath: string): Promise<string> {
        await tar.extract({ file: enginePath, cwd: outputLocationPath, gzip: true });

        const engineFile = path.join(outputLocationPath, "build", "index.js");
        if (!existsSync(engineFile)) {
            throw new Error("Unable to find index.js");
        }
        return engineFile;
    }

    private async prepareEngine(engine: WaveEngine): Promise<string> {
        let enginePath: string | null = path.join(this.baseEngineFolder, this.folderName, engine.md5);
        const tarFile = path.join(enginePath, "engine.tar");
        const isExists = existsSync(tarFile);
        if ((isExists && !(await this.isMd5Match(engine.md5, tarFile, false))) || !isExists) {
            console.info("Deleting different version of the Engine...");
            try {
                await rm(enginePath, { recursive: true });
            } catch {
                /* Do nothing if path is not exist */
            }
        }
        enginePath = this.getEnginePath(engine.md5);
        if (!enginePath) {
            console.info(`Engine ${engine.version} not found. Downloading and unpacking...`);
            enginePath = path.join(this.baseEngineFolder, this.folderName, engine.md5);
            console.log(`Storing new engine at ${enginePath}`);
            mkdirSync(enginePath, { recursive: true });
            try {
                await this.downloadEngine(engine.url, tarFile, engine.md5);
            } catch (err) {
                await rm(enginePath, { recursive: true });
                throw new Error(`Failed to download Engine: ${String(err)}`);
            }
            await this.isMd5Match(engine.md5, tarFile, true);
            try {
                enginePath = await this.unPackEngine(tarFile, enginePath);
            } catch (err) {
                await rm(enginePath, { recursive: true });
                throw new Error(`Failed to unpack Engine - ${String(err)}`);
            }
            console.info("Engine successfully written");
        } else {
            console.info(`Detected previously downloaded copy of the engine ${engine.version}.`);
        }
        return enginePath;
    }

    private async isMd5Match(md5: string, filePath: string, throwError = true): Promise<boolean> {
        const content = await fs.readFile(filePath);
        if (md5 !== crypto.createHash("md5").update(content).digest("hex")) {
            if (throwError) {
                throw new Error("MD5 hash of downloaded engine does not match the expected hash");
            }
            return false;
        }
        return true;
    }

    private async loadMetadata(): Promise<WaveEngine | undefined> {
        const metadataFile = path.join(this.baseEngineFolder, this.folderName, this.metadataFile);
        if (!existsSync(metadataFile)) return undefined;
        const content = load(await fs.readFile(metadataFile, "utf8")) as Record<string, WaveEngine>;
        if (this.version && content && this.version in content) {
            return existsSync(path.join(this.baseEngineFolder, this.folderName, content[this.version].md5, "build", "index.js")) ? content[this.version] : undefined;
        }
        return undefined;
    }

    private async updateMetadata(engine: WaveEngine): Promise<void> {
        const metadataFile = path.join(this.baseEngineFolder, this.folderName, this.metadataFile);
        let content: Record<string, WaveEngine> = {};
        if (existsSync(metadataFile)) {
            content = load(await fs.readFile(metadataFile, "utf8")) as Record<string, WaveEngine>;
        }
        content[engine.version as string] = engine;
        try {
            await fs.writeFile(metadataFile, dump(content, { sortKeys: true }), "utf8");
        } catch (err) {
            console.error(`Error writing engines metadata "${String(err)}" to "${metadataFile}"`);
        }
    }

    /**
     * Download the registry of all available Wave Engines.
     */
    async getEnginesList(): Promise<WaveEngine[]> {
        const engines: WaveEngine[] = [];
        const hcl = new hcloud({ server: "" });
        await loadConfig();
        const s3PublicWaveUrl = getConfig().s3_public_wave_url;

        let registry: EngineRegistry;
        try {
            registry = await hcl.High5.wave.s3.getEngineRegistry(s3PublicWaveUrl);
        } catch (error) {
            throw new Error(`Failed to get registry from '${s3PublicWaveUrl}': ${String(error)}`);
        }

        for (const e of registry.engines) {
            try {
                const engine: Engine = await hcl.High5.wave.s3.getEngine(e.url);
                engines.push(...engine.versions);
            } catch (error) {
                throw new Error(`Failed to get engine from '${e.url}': ${String(error)}`);
            }
        }
        return engines;
    }

    /**
     * Get specified version of Wave Engine if available
     * if the version is not specified - get the latest stable version.
     * @returns Path to downloaded engine
     */
    async getEngine(): Promise<WaveEngine> {
        let engine: WaveEngine | undefined;
        engine = await this.loadMetadata();
        if (engine) {
            setWaveEngineFolder(path.resolve(path.join(this.baseEngineFolder, this.folderName, engine.md5, "build", "index.js")));
            return engine;
        }

        let engines: WaveEngine[] = await this.getEnginesList();
        if (!engines.length) throw new Error("There are no available Wave Engines");
        // in case of a version being set it is a patchEngine request and it could be a dev version
        // otherwise it's a createSpace request and we filter out dev versions
        if (!this.version) {
            engines = engines.filter((engine: WaveEngine) => !engine.dev);
            engine = engines[engines.length - 1];
        } else {
            engine = engines.find(e => e.version === this.version);
            if (!engine)
                throw new Error(
                    `Wave Engine version ${this.version} does not exist, please try one of the following values: ${engines
                        .map(e => e.version)
                        .sort()
                        .join(", ")}`
                );
        }

        await this.prepareEngine(engine);
        await this.updateMetadata(engine);
        setWaveEngineFolder(path.resolve(path.join(this.baseEngineFolder, this.folderName, engine.md5, "build", "index.js")));
        return engine;
    }
}

export { EngineManager };

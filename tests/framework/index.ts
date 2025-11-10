import hcloud from "hcloud-sdk";
import type { DesignBuild } from "hcloud-sdk/lib/interfaces/high5/space/event/stream";
import type { ExtendedHigh5ExecutionPackage, High5ExecutionPayload } from "hcloud-sdk/lib/interfaces/high5/space/execution";
import type { StreamNodeOutput } from "wave-engine/models/StreamNode";
import type { Design } from "./definitions/application/Design";
import { EngineManager } from "./helpers/EngineManager";
import { executeStream } from "./service/StreamService";

export { addWaveNodeFolder } from "./utils/folders";

const execute = async (engineVersion: string, payload: High5ExecutionPayload, design: Design): Promise<StreamNodeOutput[]> => {
    const waveEngine = await new EngineManager(engineVersion).getEngine();
    const executionPackage = {
        design: { nodes: [], startNode: "0" } as DesignBuild,
        payload,
        waveCatalogs: [],
        waveEngine,
        dry: false,
        hcl: new hcloud({ server: "" }),
        orgName: "TestOrganization",
        spaceName: "TestSpace",
        streamId: "7".repeat(24),
        secret: "some-secret-line",
        info: { target: "o.hryshchenko+framework@moovit-sp.com" },
    } as unknown as ExtendedHigh5ExecutionPackage;

    console.info(`► Using Wave Engine ${waveEngine.version} ...`);
    try {
        const result = await executeStream(executionPackage, design);
        console.info("Output:", JSON.stringify(result[0]));
        return result;
    } catch (error) {
        console.error(String(error));
        return [];
    }
};

const executeChain = async (engineVersions: string[], payload: High5ExecutionPayload, design: Design): Promise<Record<string, StreamNodeOutput[]>> => {
    if (!engineVersions || !engineVersions.length) return {};
    const outputs: Record<string, StreamNodeOutput[]> = {};
    for await (const version of engineVersions) {
        outputs[version] = await execute(version, payload, design);
    }
    return outputs;
};

const executeWithAllEngines = async (payload: High5ExecutionPayload, design: Design): Promise<Record<string, StreamNodeOutput[]>> => {
    const versions: string[] = (await new EngineManager().getEnginesList())
        .map(engine => engine.version)
        .sort((a, b) => {
            const parse = (v: string) =>
                v
                    .replace(/-dev-(\d+)/, ".$1")
                    .split(".")
                    .map(Number);
            const [aParts, bParts] = [parse(a), parse(b)];
            for (let i = 0; i < Math.max(aParts.length, bParts.length); i++) {
                const diff = (bParts[i] ?? 0) - (aParts[i] ?? 0);
                if (diff !== 0) return diff;
            }
            return 0;
        });
    return await executeChain(versions.slice(0, 5), payload, design);
};

export { execute, executeChain, executeWithAllEngines };

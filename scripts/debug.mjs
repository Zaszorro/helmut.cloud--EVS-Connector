import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";
import os from "os";

const DEFAULT_LOCATIONS = {
    MAC: {
        EXEC: "/Applications/helmut cloud agent.app/",
        HOME: path.join(os.homedir(), ".hcloud", "agent"),
    },
    WINDOWS: {
        EXEC: "C:\\Program Files\\helmut cloud agent\\",
        HOME: path.join(os.homedir(), ".hcloud", "agent"),
    },
};

async function main() {
    const { location, configLocation } = await findAgent();

    console.log("starting agent for debugging...");
    const proc = spawn("node", ["--inspect", path.join(location, "index.js")], {
        stdio: "inherit",
        env: {
            HCLOUD_PATH: configLocation,
            ...process.env,
        },
        cwd: location,
    });
    proc.on("error", console.error);
}

async function findAgent() {
    if (process.platform === "darwin") {
        const execPath =
            process.env.HCLOUD_EXEC_PATH || DEFAULT_LOCATIONS.MAC.EXEC;
        const configLocation = path.join(
            execPath,
            "Contents",
            "Resources",
            "agent-config.yaml"
        );
        if (
            !(await fs
                .stat(configLocation)
                .then(() => true)
                .catch(() => false))
        ) {
            throw new Error(`config file not in ${configLocation}`);
        }

        const homePath = process.env.HCLOUD_HOME || DEFAULT_LOCATIONS.MAC.HOME;
        const localConfigLocation = path.join(homePath, "config.local.yaml");
        if (
            !(await fs
                .stat(localConfigLocation)
                .then(() => true)
                .catch(() => false))
        ) {
            throw new Error(
                `local config file not in ${localConfigLocation}. Make sure to run the agent at least once`
            );
        }
        const version = await getVersionFromYaml(localConfigLocation);

        return {
            configLocation: path.dirname(configLocation),
            location: path.join(homePath, "bundle", version),
        };
    } else if (process.platform === "win32") {
        const execPath =
            process.env.HCLOUD_EXEC_PATH || DEFAULT_LOCATIONS.WINDOWS.EXEC;
        const configLocation = path.join(execPath, "agent-config.yaml");
        if (
            !(await fs
                .stat(configLocation)
                .then(() => true)
                .catch(() => false))
        ) {
            throw new Error(`config file not in ${configLocation}`);
        }

        const homePath =
            process.env.HCLOUD_HOME || DEFAULT_LOCATIONS.WINDOWS.HOME;
        const localConfigLocation = path.join(homePath, "config.local.yaml");
        if (
            !(await fs
                .stat(localConfigLocation)
                .then(() => true)
                .catch(() => false))
        ) {
            throw new Error(
                `local config file not in ${localConfigLocation}. Make sure to run the agent at least once`
            );
        }
        const version = await getVersionFromYaml(localConfigLocation);

        return {
            configLocation: path.dirname(configLocation),
            location: path.join(homePath, "bundle", version),
        };
    } else {
        throw new Error(
            "debugging on this operating system is currently not supported"
        );
    }
}

async function getVersionFromYaml(path) {
    const data = await fs.readFile(path, "utf8");
    for (const line of data.split(os.EOL)) {
        const i = line.indexOf(":");
        if (i === -1) {
            continue;
        }

        const key = line.slice(0, i).trim();
        if (key !== "version") {
            continue;
        }

        return line.slice(i + 1).trim();
    }
    throw new Error(`no version field in ${path}`);
}

main().catch((err) => {
    console.error(
        `----------------------------------------------------------------------
| setting the HCLOUD_HOME and HCLOUD_EXEC_PATH environment variables |
|                     can solve ENOENT errors                        |
----------------------------------------------------------------------`
    );
    console.error(err);
});

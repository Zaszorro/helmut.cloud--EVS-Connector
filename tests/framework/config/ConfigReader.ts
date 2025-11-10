import fs from "fs/promises";
import yaml from "js-yaml";
import path from "path";

export interface Config {
    s3_public_wave_url: string;
}

let config: Config;

const loadConfig = async () => {
    config = yaml.load(await fs.readFile(path.join(path.resolve(), "tests", "framework", "config", "config.yaml"), "utf8")) as Config;

    if (process.env.CONFIG_PATH) {
        const tmpConfig = yaml.load(await fs.readFile(process.env.CONFIG_PATH, "utf8")) as Config;
        config = { ...config, ...tmpConfig };
    }
};

const getConfig = (): Config => {
    return config;
};

export { loadConfig, getConfig };

import { existsSync } from "fs";

let waveNodeFolder: string[] = [];
let waveEngineFolder: string | null = null;

export const setWaveEngineFolder = (folder: string | null): void => {
    if (folder && existsSync(folder)) waveEngineFolder = folder;
};
export function getWaveEngineFolder() {
    return waveEngineFolder;
}
export function getWaveNodeFolder() {
    return waveNodeFolder;
}
export const addWaveNodeFolder = (folder: string): void => {
    if (existsSync(folder)) waveNodeFolder.push(folder);
};
export const clearWaveNodeFolder = (): void => {
    waveNodeFolder = [];
};

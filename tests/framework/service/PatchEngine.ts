import type Wave from "wave-engine/helpers/Wave";

const patchEngine = (wave: Wave, engineVersion: string): Wave => {
    if (engineVersion.startsWith("1.5.0") || engineVersion.startsWith("1.4.0")) {
        wave.general.setStreamMessage = (message: string): void => {
            console.info("Stream message:", message);
        };
        wave.logger.updateProgress = (progress: number): void => {
            console.log("Progress:", progress);
        };
        wave.logger.updateMessage = (message: string): void => {
            console.log("Message:", message);
        };
        wave.logger.updateProgressAndMessage = (progress: number, message: string): void => {
            console.log("Message:", message, "progress:", progress);
        };
    }
    return wave;
};

export { patchEngine };

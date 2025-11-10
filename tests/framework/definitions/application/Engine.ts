import { High5ExecutionPatchLog, High5ExecutionPatchStatus, StreamNode } from "hcloud-sdk/lib/interfaces/high5/space/execution";
import os from "os";
import VerifyFileSignature from "./VerifyFileSignature";

interface IVerifyFileSignature {
    new (): VerifyFileSignature;
}

interface ExecutionState {
    status: High5ExecutionPatchStatus;
    logs: High5ExecutionPatchLog;
}

export declare interface Engine {
    run(): Promise<any>;
    runDev(...waveNodeFolder: string[]): Promise<any>;
    dry(): Promise<any>;
    getStatusAndLogs(): ExecutionState;
    cancelExecution(): void;
    debugClient?: DebugClient;
}

export const importEngine = (
    path: string
): Promise<{
    default: new (streamPackage: any, signatureVerificator?: IVerifyFileSignature, catalogPath?: string, agentInfo?: AgentInfo) => Engine;
}> => {
    return import(path);
};

type AgentInfo = {
    os: {
        type: string;
        platform: string;
    };
    cpu: string;
    hostname: string;
    ip?: string;
    version?: string;
};

export function getAgentInfo(): AgentInfo {
    return {
        os: {
            platform: os.platform(),
            type: os.type(),
        },
        hostname: os.hostname(),
        cpu: os.cpus()[0]?.model,
        ip: "0.0.0.0",
        version: "1.0.0",
    };
}

export type DebugClient = {
    setValue(uuid: string, key: string, value: unknown): void;
    continue(): void;
    stepForward(): void;
    stepBack(): void;
    replaceNode(node: StreamNode): void;
    restart(): void;
};

import type { StreamNodeOutput, StreamNodeResolvedInput } from "wave-engine/models/StreamNode";

interface NodeInputs {
    [key: string]: unknown;
}

interface NodeData {
    [uuid: string]: {
        input: StreamNodeResolvedInput[];
        output: StreamNodeOutput[];
    };
}

export { NodeData, NodeInputs };

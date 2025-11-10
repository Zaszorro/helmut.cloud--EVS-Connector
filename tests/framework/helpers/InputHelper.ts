import { StreamNodeResolvedInputs } from "hcloud-sdk/lib/interfaces/high5";
import type { NodeData, NodeInputs } from "../definitions/application/StreamNode";

function parseValue<T>(original: T, nodeData: NodeData): T {
    if (typeof original !== "string") return original;
    const matches = original.match(/{{node.(.+).output.(.+)}}/i);
    if (!matches || matches.length < 3) return original;
    if (!Object.prototype.hasOwnProperty.call(nodeData, matches[1]))
        throw new Error(`Wrong value template ${original} - the design has no node with uuid ${matches[1]}.`);
    try {
        return nodeData[matches[1]].output.filter(e => e.name === matches[2])[0].value;
    } catch {
        throw new Error(`There are no results of execution of the node with uuid ${matches[1]} or specified an incorrect name of the output field`);
    }
}

const resolveInputs = (inputs: NodeInputs, nodeData: NodeData): StreamNodeResolvedInputs[] => {
    const result: StreamNodeResolvedInputs[] = [];
    for (const key in inputs) {
        // eslint-disable-next-line no-prototype-builtins
        if (inputs.hasOwnProperty(key)) {
            result.push({ name: key, value: parseValue(inputs[key], nodeData) } as StreamNodeResolvedInputs);
        }
    }
    return result;
};

export { resolveInputs };

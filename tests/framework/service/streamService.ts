import { High5ExecutionPackage, High5ExecutionPayloadType } from "hcloud-sdk/lib/interfaces/high5/space/execution";
import type { StreamNodeOutput } from "wave-engine/models/StreamNode";
import type { Design } from "../definitions/application/Design";
import { Engine, getAgentInfo, importEngine } from "../definitions/application/Engine";
import type { ExtendedHigh5ExecutionPackage } from "../definitions/application/Execution";
import type { NodeData } from "../definitions/application/StreamNode";
import VerifyFileSignature from "../definitions/application/VerifyFileSignature";
import { resolveInputs } from "../helpers/InputHelper";
import { getWaveEngineFolder, getWaveNodeFolder } from "../utils/folders";
import { patchEngine } from "./PatchEngine";

const parsePayload = (executionPackage: High5ExecutionPackage) => {
    let payloadData = undefined;
    switch (executionPackage.payload.type) {
        case High5ExecutionPayloadType.JSON:
            try {
                payloadData = typeof executionPackage.payload.data !== "object" ? JSON.parse(executionPackage.payload.data) : executionPackage.payload.data;
            } catch (error: unknown) {
                console.error(`Unable to parse payload to json - ${error}`);
                return null;
            }
            console.info("Successfully parsed payload to json");
            break;
        default:
            console.info("Successfully parsed payload to plain text");
            break;
    }
    return payloadData;
};

const getEngineInstance = async (executionPackage: ExtendedHigh5ExecutionPackage): Promise<Engine | undefined> => {
    const folder = getWaveEngineFolder();
    if (!folder) return undefined;
    try {
        const module = await importEngine(folder);
        return new module.default(executionPackage, VerifyFileSignature, "", getAgentInfo());
    } catch (err: unknown) {
        console.error(`Unable to load Engine file - ${err}`);
    }
    return undefined;
};

const runEngine = async (executionPackage: ExtendedHigh5ExecutionPackage) => {
    const engine = await getEngineInstance(executionPackage);
    if (!engine) {
        console.error("Can't load the engine!");
        return [];
    }
    const nodeCatalogs = getWaveNodeFolder();
    const run = nodeCatalogs.length ? engine.runDev.bind(engine, ...nodeCatalogs) : engine.run.bind(engine);
    return await run();
};

const executeStream = async (executionPackage: ExtendedHigh5ExecutionPackage, design: Design): Promise<StreamNodeOutput[]> => {
    // parse payload
    executionPackage.payload.data = parsePayload(executionPackage);

    const nodes: NodeData = {};
    let duration = 0;
    while (design) {
        console.info("• Execute node:", design.node);
        executionPackage.design = {
            nodes: [
                {
                    uuid: String(design.uuid),
                    name: design.node,
                    catalog: { _id: "1", version: "0.0.1", url: "https://helmut.cloud/", changeLog: [] },
                    path: `name://${design.node}`,
                    inputs: resolveInputs(design.inputs, nodes),
                },
            ],
            startNode: String(design.uuid),
        };
        const result = await runEngine(executionPackage);
        if (result.nodeResults[0].failed) console.info(result.nodeResults[0].error);

        nodes[String(design.uuid)] = { input: result.nodeResults[0].inputs || [], output: result.nodeResults[0].outputs || [] };
        duration += result.nodeResults[0].duration;
        if (design.onSuccess) {
            design = design.onSuccess;
        } else break;
    }

    const outputs = [...nodes[String(design.uuid)].output, { name: "Run time", value: duration } as StreamNodeOutput];
    return outputs;
};

export { executeStream };

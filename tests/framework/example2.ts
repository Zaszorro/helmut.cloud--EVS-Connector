import { addWaveNodeFolder, executeChain } from ".";
import { High5ExecutionPayloadType } from "hcloud-sdk/lib/interfaces/high5/space/execution";
import path from "path";

const engineVersions = ["2.0.1", "2.0.0-dev-12", "2.0.0-dev-1"];
addWaveNodeFolder(path.resolve(path.join("..", "wave-nodes", "build", "catalog")));
const payload = { type: High5ExecutionPayloadType.JSON, data: "{}" };

const DESIGN = {
    node: "PythonAction",
    uuid: 1,
    inputs: {
        ["Path to the Python interpreter"]: "python3",
        Code: "from wonderwords import RandomWord as RW; print('Random words:', ', '.join([RW().word().capitalize() for i in range(10)]), end='.')",
        Dependencies: "wonderwords",
    },
    onSuccess: {
        node: "StringCaseConverter",
        uuid: 2,
        inputs: {
            ["Input String"]: "{{node.1.output.Stdout}}",
            ["Case Type"]: "Lowercase",
        },
        onSuccess: {
            node: "SleepAction",
            uuid: 3,
            inputs: {
                ["Sleep Duration"]: 5000,
            },
            onSuccess: {
                node: "StringCaseConverter",
                uuid: 4,
                inputs: {
                    ["Input String"]: "{{node.2.output.Converted string}}",
                    ["Case Type"]: "Title Case",
                },
            },
        },
    },
};

executeChain(engineVersions, payload, DESIGN).then(outputs => {
    console.info("🔍 Execution results:");
    Object.keys(outputs).forEach(ver => {
        console.info(`✅ Execution duration with engine ${ver} = ${(outputs[ver].filter(k => k.name === "Run time")[0].value / 1000).toFixed(1)} sec.`);
    });
});

import { addWaveNodeFolder, executeWithAllEngines } from ".";
import { High5ExecutionPayloadType } from "hcloud-sdk/lib/interfaces/high5/space/execution";
import path from "path";

addWaveNodeFolder(path.resolve(path.join("..", "wave-nodes", "build", "catalog")));
const payload = { type: High5ExecutionPayloadType.JSON, data: "{}" };

const DESIGN = {
    node: "StringCaseConverter",
    uuid: 1,
    inputs: {
        ["Input String"]: '{"sentence":"all words in this line will be converted to title case."}',
        ["Case Type"]: "Title Case",
    },
    onSuccess: {
        node: "StringToJsonAction",
        uuid: 2,
        inputs: {
            String: "{{node.1.output.Converted string}}",
        },
    },
};

executeWithAllEngines(payload, DESIGN).then(results => {
    console.info("🔍 Execution results:");
    Object.keys(results).forEach(ver => {
        console.info(`✅ Execution with engine ${ver} -> ${results[ver].length === 0 ? "FAIL" : "SUCCESS"}`);
    });
});

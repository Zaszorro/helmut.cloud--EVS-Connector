// lib/nodes/EVSConnector.ts
import Node from "../Node";
import axios from "axios";

type InputType = "STRING" | "STRING_PASSWORD" | "NUMBER" | "BOOLEAN";
type OutputType = "NUMBER" | "STRING" | "STRING_MAP" | "STRING_ARRAY";

enum InputName {
  HOST_URL = "Host URL",
  TARGET_NAME = "Target Name",
  TARGET_ID = "Target ID",
  XSQUARE_PRIORITY = "XSquare Priority",
  METADATA_SET_NAME = "Metadata Set Name",
  FILE_PATH = "File Path",
  METADATA = "Metadata",
}

enum OutputName {
  STATUS = "Status code",
  HEADERS = "Headers",
  BODY = "Body",
  RUN_TIME = "Run time",
  JOB_ID = "Job Id",
}

function normalizeBase(hostUrl: string): string {
  const t = (hostUrl || "").trim().replace(/\/+$/g, "");
  // Ensure base ends at /evsconn/v1
  if (/\/evsconn\/v1$/i.test(t)) return t;
  if (/\/evsconn\/v1\//i.test(t)) return t.replace(/\/+$/g, "").replace(/\/$/, "");
  return `${t}/evsconn/v1`;
}

function toJobNameFromPath(p: string): string {
  const s = String(p || "");
  const parts = s.split(/[\\\/]/).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : s || "transfer";
}

function prettyBody(data: any, headers: any): string {
  const ct = String(headers?.["content-type"] || headers?.["Content-Type"] || "");
  if (typeof data === "string") return data;
  if (/json/i.test(ct)) return JSON.stringify(data ?? null, null, 2);
  try { return JSON.stringify(data ?? null, null, 2); } catch { return String(data); }
}

// EVS Swagger reference: see evsconnectorswagger.json (JobDTO/JobStatusDTO)
export default class EVSConnector extends Node {
  specification = {
    specVersion: 2,
    name: "EVS Connector",
    originalName: "EVS Connector",
    description: "Submits a transfer job to the EVS Connector and outputs the server job id. (No polling)",
    kind: "NODE",
    category: "EVS",
    color: "node-aquaGreen",
    version: { major: 1, minor: 1, patch: 0, changelog: ["Create-only mode: remove polling, output server Job Id"] },
    author: {
      name: "MoovIT SP",
      company: "MoovIT SP",
      email: "support@helmut.cloud",
    },
    inputs: [
      { name: InputName.HOST_URL, description: "Base URL of the EVS Connector (e.g. http://host:8084 or http://host:8084/evsconn/v1)", type: "STRING" as InputType, example: "http://10.0.0.1:8084", mandatory: true },
      { name: InputName.TARGET_NAME, description: "Destination system or logical target name", type: "STRING" as InputType, example: "XSquare", mandatory: true },
      { name: InputName.TARGET_ID, description: "Identifier of the destination target (e.g. XSquare target id)", type: "STRING" as InputType, example: "xq-target-01", mandatory: true },
      { name: InputName.XSQUARE_PRIORITY, description: "Optional XSquare priority", type: "STRING" as InputType, example: "5", mandatory: false },
      { name: InputName.METADATA_SET_NAME, description: "XSquare metadata profile name", type: "STRING" as InputType, example: "DefaultMeta", mandatory: false },
      { name: InputName.FILE_PATH, description: "Path of the file to transfer", type: "STRING" as InputType, example: "C:/media/clip01.mov", mandatory: true },
      { name: InputName.METADATA, description: "Metadata as JSON (array of objects or simple key-value map)", type: "STRING" as InputType, example: "[{ \"id\": \"title\", \"value\": \"My Clip\" }]", mandatory: false },
    ],
    outputs: [
      { name: OutputName.STATUS, description: "HTTP status of the POST /job request", type: "NUMBER" as OutputType, example: 200 },
      { name: OutputName.HEADERS, description: "Response headers from POST /job", type: "STRING_MAP" as OutputType, example: { "content-type": "application/json" } },
      { name: OutputName.BODY, description: "Response body from POST /job", type: "STRING" as OutputType, example: "{ id: '...', status: '...' }" },
      { name: OutputName.RUN_TIME, description: "Execution time (ms) of the POST call", type: "NUMBER" as OutputType, example: 42 },
      { name: OutputName.JOB_ID, description: "Server-provided job id returned by POST /job", type: "STRING" as OutputType, example: "1762853233578-662iviwq53p" },
    ],
  };

  async execute(): Promise<void> {
    const started = Date.now();

    const base = normalizeBase(String(this.wave.inputs.getInputValueByInputName(InputName.HOST_URL) ?? ""));
    const targetName = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_NAME) ?? "").trim();
    const targetId = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_ID) ?? "").trim();
    const xsquarePriority = String(this.wave.inputs.getInputValueByInputName(InputName.XSQUARE_PRIORITY) ?? "").trim();
    const metadatasetName = String(this.wave.inputs.getInputValueByInputName(InputName.METADATA_SET_NAME) ?? "").trim();
    const filePath = String(this.wave.inputs.getInputValueByInputName(InputName.FILE_PATH) ?? "").trim();
    const metadataRaw = String(this.wave.inputs.getInputValueByInputName(InputName.METADATA) ?? "").trim();

    if (!base) throw new Error("Host URL is required");
    if (!targetName) throw new Error("Target Name is required");
    if (!targetId) throw new Error("Target ID is required");
    if (!filePath) throw new Error("File Path is required");

    // Parse metadata: allow array or simple key-value map
    let metadata: any[] | undefined = undefined;
    if (metadataRaw) {
      try {
        const parsed = JSON.parse(metadataRaw);
        if (Array.isArray(parsed)) {
          metadata = parsed;
        } else if (parsed && typeof parsed === "object") {
          metadata = Object.entries(parsed).map(([k, v]) => ({ id: String(k), name: String(k), value: String(v ?? "") }));
        }
      } catch {
        // ignore invalid metadata JSON
      }
    }

    const name = toJobNameFromPath(filePath);
    const body: any = {
      name,
      targetName,
      targetId,
      fileToTransfer: filePath,
    };
    if (xsquarePriority) body.xsquarePriority = xsquarePriority;
    if (metadatasetName) body.metadatasetName = metadatasetName;
    if (metadata) body.metadata = metadata;

    const url = `${base}/job`;
    const res = await axios.request({
      method: "POST",
      url,
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      data: body,
      validateStatus: () => true,
    });

    // Outputs
    this.wave.outputs.setOutput(OutputName.STATUS, res.status);
    this.wave.outputs.setOutput(OutputName.HEADERS, res.headers || {});
    this.wave.outputs.setOutput(OutputName.BODY, prettyBody(res.data, res.headers));
    this.wave.outputs.setOutput(OutputName.RUN_TIME, Date.now() - started);

    // Prefer the server-provided id
    const serverJobId: string =
      (typeof res.data === "object" && res.data && "id" in res.data) ? String(res.data.id) : "";
    this.wave.outputs.setOutput(OutputName.JOB_ID, serverJobId);

    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status} POST ${url}`);
    }
  }
}

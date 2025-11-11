// lib/nodes/EVSConnector.ts
import Node from "../Node";
import axios from "axios";

type InputType = "STRING" | "STRING_PASSWORD" | "NUMBER" | "BOOLEAN";
type OutputType = "NUMBER" | "STRING" | "STRING_MAP" | "STRING_ARRAY" | "JSON";

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
  JOB_ID = "Job ID",
  JOB_STATUS = "Job Status",
  JOB_PROGRESS = "Job Progress",
  POLL_BODY = "Polling body",
  PROGRESS = "Progress",
}

function normalizeBase(hostUrl: string): string {
  const t = (hostUrl || "").trim().replace(/\/+$/g, "");
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

function sleep(ms: number) { return new Promise(r => setTimeout(r, ms)); }

function makeClientJobId(): string { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

export default class EVSConnector extends Node {
  specification = {
    specVersion: 3,
    name: "EVS Connector",
    originalName: "EVS Connector",
    description: "Creates an EVS Connector job, then polls status every 5s and streams dashboard progress.",
    kind: "NODE",
    category: "EVS",
    color: "node-aquaGreen",
    version: {
      major: 1, minor: 3, patch: 0,
      changelog: [
        "Reintroduce polling (5s) and dashboard progress output",
        "Stop when status = 'EVS Checkin Successful' or progress >= 1 (or 100)",
        "Use client-provided ID, prefer server ID if returned",
        "specVersion 3; BODY & POLL_BODY as JSON outputs"
      ]
    },
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
      { name: OutputName.BODY, description: "Response body from POST /job", type: "JSON" as OutputType, example: { "id": "1762853233578-662iviwq53p", "status": "EVS Checkin" } },
      { name: OutputName.RUN_TIME, description: "Execution time (ms) of the POST call", type: "NUMBER" as OutputType, example: 42 },
      { name: OutputName.JOB_ID, description: "Job ID used for polling", type: "STRING" as OutputType, example: "1762853233578-662iviwq53p" },
      { name: OutputName.JOB_STATUS, description: "Final job status returned by polling", type: "STRING" as OutputType, example: "EVS Checkin Successful" },
      { name: OutputName.JOB_PROGRESS, description: "Final reported job progress (0-100)", type: "NUMBER" as OutputType, example: 100 },
      { name: OutputName.PROGRESS, description: "Returns the current progress percentage during polling", type: "NUMBER" as OutputType, example: 1 },
      { name: OutputName.POLL_BODY, description: "Final polling response body (JSON)", type: "JSON" as OutputType, example: { "status": "EVS Checkin Successful", "progress": 1 } },
    ],
    additionalConnectors: [
      { name: OutputName.PROGRESS, description: "Executed for every percent (limited to 1/s)" },
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

    // Prepare metadata
    let metadata: any[] | undefined = undefined;
    if (metadataRaw) {
      try {
        const parsed = JSON.parse(metadataRaw);
        if (Array.isArray(parsed)) metadata = parsed;
        else if (parsed && typeof parsed === "object") {
          metadata = Object.entries(parsed).map(([k, v]) => ({ id: String(k), name: String(k), value: String(v ?? "") }));
        }
      } catch { /* ignore invalid metadata */ }
    }

    // Create job
    const name = toJobNameFromPath(filePath);
    const clientJobId = makeClientJobId();

    const body: any = {
      id: clientJobId,
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
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      data: body,
      validateStatus: () => true,
    });

    // Outputs from create-call
    this.wave.outputs.setOutput(OutputName.STATUS, res.status);
    this.wave.outputs.setOutput(OutputName.HEADERS, res.headers || {});
    this.wave.outputs.setOutput(OutputName.BODY, (typeof res.data === "string" ? (() => { try { return JSON.parse(res.data); } catch { return { raw: res.data }; } })() : (res.data ?? null)));
    this.wave.outputs.setOutput(OutputName.RUN_TIME, Date.now() - started);

    // Determine polling id (prefer server id if present)
    let pollJobId: string = clientJobId;
    try {
      if (res && typeof res.data === "object" && res.data) {
        if ("id" in res.data) pollJobId = String((res.data as any).id);
        else if ("jobId" in res.data) pollJobId = String((res.data as any).jobId);
      } else if (typeof res.data === "string") {
        try { const obj = JSON.parse(res.data); if (obj?.id) pollJobId = String(obj.id); } catch {}
      }
    } catch {}
    this.wave.outputs.setOutput(OutputName.JOB_ID, pollJobId);

    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status} POST ${url}`);
    }

    // === Polling ===
    const pollUrlBase = `${base}/job/status/${encodeURIComponent(pollJobId)}`;
    let lastStatus = "";
    let lastProgress = 0;
    let lastEmitted = -1;
    let lastPollRaw: any = null;
    let lastPollHeaders: any = null;

    const terminalGeneric = new Set(["COMPLETED","FAILED","CANCELED","CANCELLED","SUCCESS","SUCCESSFUL"]);
    const deadline = Date.now() + 1000 * 60 * 30; // 30 min safety

    while (Date.now() < deadline) {
      const stat = await axios.request({
        method: "GET",
        url: `${pollUrlBase}?_t=${Date.now()}`,
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
        validateStatus: () => true,
      });

      lastPollRaw = stat.data;
      lastPollHeaders = stat.headers;

      try {
        const data = typeof stat.data === "string" ? JSON.parse(stat.data) : stat.data;
        const s = String(data?.status ?? (lastStatus || ""));
        const p = (data?.progress ?? lastProgress);
        lastStatus = s;
        lastProgress = Number.isFinite(p) ? Number(p) : lastProgress;
      } catch { /* keep previous */ }

      // Emit dashboard progress when integer increases
      const emit = Number.isFinite(lastProgress) ? Math.floor(Number(lastProgress)) : 0;
      if (emit > lastEmitted) {
        try { this.wave.logger.updateProgress(emit); } catch {}
        this.wave.outputs.setOutput(OutputName.PROGRESS, emit);
        this.wave.outputs.executeAdditionalConnector(OutputName.PROGRESS);
        lastEmitted = emit;
      }

      // Stop when: status == "EVS Checkin Successful" OR progress >= 1 OR progress >= 100 OR generic terminal
      const statusUpper = (lastStatus || "").toUpperCase();
      const okEVS = statusUpper === "EVS CHECKIN SUCCESSFUL";
      if (okEVS || emit >= 1 || emit >= 100 || terminalGeneric.has(statusUpper)) {
        break;
      }

      await sleep(5000);
    }

    // Final outputs
    this.wave.outputs.setOutput(OutputName.JOB_STATUS, lastStatus || "UNKNOWN");
    this.wave.outputs.setOutput(OutputName.JOB_PROGRESS, Number.isFinite(lastProgress) ? lastProgress : 0);
    this.wave.outputs.setOutput(OutputName.POLL_BODY, (typeof lastPollRaw === "string" ? (() => { try { return JSON.parse(lastPollRaw); } catch { return { raw: lastPollRaw }; } })() : (lastPollRaw ?? null)));
  }
}

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
  JOB_STATUS = "Job Status",
  JOB_PROGRESS = "Job Progress",
}

function normalizeBase(hostUrl: string): string {
  const t = (hostUrl || "").trim().replace(/\/+$/g, "");
  // Ensure base ends at /evsconn/v1 (according to Swagger paths)
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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function makeClientJobId(): string {
  const rnd = Math.random().toString(36).slice(2);
  return `${Date.now()}-${rnd}`;
}

/**
 * EVS Connector
 * - POST /evsconn/v1/job       (submit job)
 * - GET  /evsconn/v1/job/status/{jobId} (poll status)
 */
export default class EVSConnector extends Node {
  specification = {
    specVersion: 2,
    name: "EVS Connector",
    originalName: "EVS Connector",
    description: "Submits a transfer job to the EVS Connector and polls its status until completion.",
    kind: "NODE",
    category: "EVS",
    color: "node-aquaGreen",
    version: { major: 1, minor: 0, patch: 2, changelog: ["English labels, robust polling, metadata parsing", "Fix: explicit parentheses for ?? with ||"] },
    author: {
      name: "David Merzenich",
      company: "MoovIT SP",
      email: "d.merzenich@moovit-sp.com",
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
      { name: OutputName.BODY, description: "Response body from POST /job", type: "STRING" as OutputType, example: "{ id: '...', status: 'RUNNING' }" },
      { name: OutputName.RUN_TIME, description: "Execution time (ms) of the POST call", type: "NUMBER" as OutputType, example: 42 },
      { name: OutputName.JOB_ID, description: "Client-side job id used for polling", type: "STRING" as OutputType, example: "1731312345678-abc123" },
      { name: OutputName.JOB_STATUS, description: "Final job status", type: "STRING" as OutputType, example: "COMPLETED" },
      { name: OutputName.JOB_PROGRESS, description: "Final reported job progress (0-100)", type: "NUMBER" as OutputType, example: 100 },
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

    const jobId = makeClientJobId();
    const name = toJobNameFromPath(filePath);

    // Parse metadata: allow array of Metadata or simple { key: value } map
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

    const body: any = {
      id: jobId,
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

    this.wave.outputs.setOutput(OutputName.STATUS, res.status);
    this.wave.outputs.setOutput(OutputName.HEADERS, res.headers || {});
    this.wave.outputs.setOutput(OutputName.BODY, prettyBody(res.data, res.headers));
    this.wave.outputs.setOutput(OutputName.RUN_TIME, Date.now() - started);
    this.wave.outputs.setOutput(OutputName.JOB_ID, jobId);

    if (res.status >= 400) {
      throw new Error(`HTTP ${res.status} POST ${url}`);
    }

    // Poll job status until terminal state
    const pollUrl = `${base}/job/status/${encodeURIComponent(jobId)}`;
    const terminal = new Set(["COMPLETED", "FAILED", "CANCELED", "CANCELLED", "SUCCESS", "SUCCESSFUL"]);
    let lastStatus: string = "";
    let lastProgress: number = 0;

    const deadline = Date.now() + 1000 * 60 * 30; // 30 minutes safety
    while (Date.now() < deadline) {
      const stat = await axios.request({
        method: "GET",
        url: pollUrl,
        headers: { Accept: "application/json" },
        validateStatus: () => true,
      });

      try {
        const data = typeof stat.data === "string" ? JSON.parse(stat.data) : stat.data;
        // Explicit parentheses to satisfy esbuild rule: x ?? (y || z)
        lastStatus = String(data?.status ?? (lastStatus || "RUNNING"));
        const p = (data?.progress ?? lastProgress);
        lastProgress = Number.isFinite(p) ? Number(p) : lastProgress;
      } catch {
        // keep previous
      }

      // Update High5/Wave engine's visible progress if available
      try {
        // @ts-ignore optional engine helper
        this.wave?.progress?.setProgress?.(lastProgress ?? 0, lastStatus || "RUNNING");
      } catch {}

      if (terminal.has((lastStatus || "").toUpperCase())) break;
      await sleep(1000 * 2);
    }

    this.wave.outputs.setOutput(OutputName.JOB_STATUS, lastStatus || "UNKNOWN");
    this.wave.outputs.setOutput(OutputName.JOB_PROGRESS, Number.isFinite(lastProgress) ? lastProgress : 0);

    if (!terminal.has((lastStatus || "").toUpperCase())) {
      throw new Error(`Polling timed out for job ${jobId} (last status: ${lastStatus || "UNKNOWN"})`);
    }
    if (/^fail/i.test(lastStatus)) {
      throw new Error(`EVS Connector reported failure for job ${jobId}`);
    }
  }
}

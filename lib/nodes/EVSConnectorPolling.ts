// lib/nodes/EVSConnectorPolling.ts
import Node from "../Node";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

type InputType = "STRING" | "STRING_PASSWORD" | "NUMBER" | "BOOLEAN";
type OutputType = "NUMBER" | "STRING" | "STRING_MAP" | "STRING_ARRAY";

enum InputName {
  HOST_URL = "HOST URL",
  TARGET_NAME = "Target Name",
  TARGET_ID = "TargetID",
  XSQUARE_PRIORITY = "XSquare priority",
  METADATASET_NAME = "Meadats set name",
  FILEPATH = "filepath",
  METADATA = "Metadaten",
}

enum OutputName {
  STATUS = "Status code",
  HEADERS = "Headers",
  BODY = "Body",
  RUN_TIME = "Run time",
  JOB_ID = "Job Id",
  REQUEST = "Request",
}

function normalizeBase(hostUrl: string): string {
  return (hostUrl || "").trim().replace(/\/+$/g, "");
}

function prettyBody(data: any, headers: any): string {
  try {
    const ct = String((headers && (headers as any)["content-type"]) || "").toLowerCase();
    const isJson = typeof data === "object" || ct.includes("application/json");
    return isJson
      ? (typeof data === "string" ? JSON.stringify(JSON.parse(data), null, 2) : JSON.stringify(data, null, 2))
      : (typeof data === "string" ? data : String(data));
  } catch {
    return typeof data === "string" ? data : String(data);
  }
}

type Metadata = { id?: string; name?: string; value?: string; values?: string[]; };
type JobDTO = {
  id?: string; name?: string; metadata?: Metadata[]; marker?: any[];
  targetName?: string; targetId?: string; xsquarePriority?: string;
  metadatasetName?: string; fileToTransfer?: string;
};

function clean<T extends Record<string, any>>(obj: T): T {
  const out: Record<string, any> = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v === undefined || v === null) continue;
    if (typeof v === "string" && v.trim() === "") continue;
    if (Array.isArray(v) && v.length === 0) continue;
    out[k] = v;
  }
  return out as T;
}

function parseMetadata(raw: string | undefined | null): Metadata[] {
  if (!raw) return [];
  const txt = String(raw).trim();
  if (!txt) return [];
  try {
    const parsed = JSON.parse(txt);
    if (Array.isArray(parsed)) return parsed as Metadata[];
    if (parsed && typeof parsed === "object") {
      return Object.entries(parsed as Record<string, string>).map(([k, v]) => ({ id: k, name: k, value: String(v) }));
    }
  } catch {}
  const out: Metadata[] = [];
  const parts = txt.split(/[\r\n;]+/).map((p) => p.trim()).filter(Boolean);
  for (const p of parts) {
    const m = p.match(/^\s*([^=:#]+)\s*[:=]\s*(.*)\s*$/);
    if (m) out.push({ id: m[1].trim(), name: m[1].trim(), value: m[2].trim() });
  }
  return out;
}

function extractJobId(data: any): string {
  try {
    const obj = typeof data === "string" ? JSON.parse(data) : data;
    return String(obj?.jobId ?? obj?.id ?? obj?.data?.id ?? obj?.data?.jobId ?? "");
  } catch { return ""; }
}

function generateClientId(): string {
  const t = Date.now().toString(16);
  const r = Math.floor(Math.random() * 0xffffffff).toString(16).padStart(8, "0");
  return (t + r).slice(0, 24);
}

async function httpPostJson(url: string, json: string): Promise<AxiosResponse> {
  const cfg: AxiosRequestConfig = {
    headers: { "Content-Type": "application/json", "Content-Length": Buffer.byteLength(json).toString() },
    validateStatus: () => true,
    timeout: 60000,
    transformRequest: [(d) => d],
    transitional: { forcedJSONParsing: false },
  };
  return axios.post(url, json, cfg);
}

async function tryGet(url: string): Promise<AxiosResponse> {
  // Some servers disallow GET to info endpoints; if 405/404, just return as-is
  const cfg: AxiosRequestConfig = { validateStatus: () => true, timeout: 60000 };
  return axios.get(url, cfg);
}

export default class EVSConnectorPolling extends Node {
  specification = {
    specVersion: 2,
    name: "EVS Connector (with polling)",
    originalName: "EVS Connector (with polling)",
    description: "Creates an EVS transfer job (POST /evsconn/v1/job) and optionally polls status if endpoint exists.",
    kind: "NODE",
    category: "Transfer",
    color: "node-aquaGreen",
    version: { major: 1, minor: 0, patch: 0, changelog: ["Add optional status polling against /evsconn/v1/job/status/{jobId}"] },
    author: { name: "Code Copilot", company: "Community", email: "n/a" },
    inputs: [
      { name: InputName.HOST_URL, description: "Base URL (no path).", type: "STRING" as InputType, example: "http://10.0.0.1:8084", mandatory: true },
      { name: InputName.TARGET_NAME, description: "XSquare target name.", type: "STRING" as InputType, example: "XSquareTarget", mandatory: true },
      { name: InputName.TARGET_ID, description: "XSquare target ID.", type: "STRING" as InputType, example: "123", mandatory: true },
      { name: InputName.XSQUARE_PRIORITY, description: "Priority as string.", type: "STRING" as InputType, example: "High", mandatory: false },
      { name: InputName.METADATASET_NAME, description: "Metadataset name (optional).", type: "STRING" as InputType, example: "general", mandatory: false },
      { name: InputName.FILEPATH, description: "Full path to the video file.", type: "STRING" as InputType, example: "\\\\XSTORE\\TEMP\\...", mandatory: true },
      { name: InputName.METADATA, description: "Metadata JSON or key=value;key2=value2.", type: "STRING" as InputType, example: "title=Clip 01;show=Sports", mandatory: false },
    ],
    outputs: [
      { name: OutputName.STATUS, description: "HTTP status.", type: "NUMBER" as OutputType, example: 201 },
      { name: OutputName.HEADERS, description: "Response headers.", type: "STRING_MAP" as OutputType, example: { "content-type": "application/json" } },
      { name: OutputName.BODY, description: "Response body.", type: "STRING" as OutputType, example: "{ id: '...', jobId: '...' }" },
      { name: OutputName.RUN_TIME, description: "Execution time in milliseconds.", type: "NUMBER" as OutputType, example: 42000 },
      { name: OutputName.JOB_ID, description: "Job ID (if available).", type: "STRING" as OutputType, example: "6911a27b..." },
      { name: OutputName.REQUEST, description: "Exact JSON request sent.", type: "STRING" as OutputType, example: "{\"name\":\"file.mov\"}" },
    ],
  };

  async execute(): Promise<void> {
    const started = Date.now();

    const baseUrl = normalizeBase(String(this.wave.inputs.getInputValueByInputName(InputName.HOST_URL) ?? ""));
    const targetName = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_NAME) ?? "").trim();
    const targetId = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_ID) ?? "").trim();
    const xsquarePriority = String(this.wave.inputs.getInputValueByInputName(InputName.XSQUARE_PRIORITY) ?? "").trim();
    const metadatasetNameRaw = String(this.wave.inputs.getInputValueByInputName(InputName.METADATASET_NAME) ?? "").trim();
    const fileToTransfer = String(this.wave.inputs.getInputValueByInputName(InputName.FILEPATH) ?? "").trim();
    const metadataRaw = String(this.wave.inputs.getInputValueByInputName(InputName.METADATA) ?? "");

    if (!baseUrl) throw new Error("HOST URL is required");
    if (!targetName) throw new Error("Target Name is required");
    if (!targetId) throw new Error("TargetID is required");
    if (!fileToTransfer) throw new Error("filepath is required");

    const url = `${baseUrl}/evsconn/v1/job`;
    const name = fileToTransfer.split(/[\\/]/).pop() || fileToTransfer;

    const metadata = parseMetadata(metadataRaw);
    const metadatasetName = metadata.length && !metadatasetNameRaw ? "general" : metadatasetNameRaw || undefined;

    const payload: JobDTO = clean({
      id: generateClientId(),
      name,
      metadata: metadata.length ? metadata : undefined,
      marker: [],
      targetName,
      targetId,
      xsquarePriority: xsquarePriority || undefined,
      metadatasetName,
      fileToTransfer,
    });

    const json = JSON.stringify(payload);
    this.wave.outputs.setOutput(OutputName.REQUEST, json);

    try {
      const createRes = await httpPostJson(url, json);

      this.wave.outputs.setOutput(OutputName.STATUS, Number(createRes.status));
      this.wave.outputs.setOutput(OutputName.HEADERS, createRes.headers as any);
      this.wave.outputs.setOutput(OutputName.BODY, prettyBody(createRes.data, createRes.headers));

      const jobId = extractJobId(createRes.data);
      this.wave.outputs.setOutput(OutputName.JOB_ID, jobId);

      if (createRes.status >= 400) throw new Error(`HTTP ${createRes.status} POST ${url}`);

      // Optional polling: only if we have a jobId and the status endpoint permits GET
      if (jobId) {
        const statusUrl = `${baseUrl}/evsconn/v1/job/status/${encodeURIComponent(jobId)}`;
        const maxAttempts = 60; // ~2min with 2s interval
        const delayMs = 2000;

        for (let attempt = 1; attempt <= maxAttempts; attempt++) {
          const statusRes = await tryGet(statusUrl);
          const code = Number(statusRes.status);

          if (code === 405 || code === 404) {
            // Server does not support/allow GET status -> stop polling gracefully
            break;
          }

          if (code >= 400 && code < 600 && code !== 200) {
            // treat as transient unless last attempt
            if (attempt === maxAttempts) throw new Error(`HTTP ${code} GET ${statusUrl}`);
          }

          if (code === 200) {
            const bodyStr = prettyBody(statusRes.data, statusRes.headers);
            // Try to read "status" field and react on terminal states
            try {
              const payload = typeof statusRes.data === "string" ? JSON.parse(statusRes.data) : statusRes.data;
              const st = String(payload?.status || payload?.state || "").toLowerCase();
              // Update outputs for visibility
              this.wave.outputs.setOutput(OutputName.BODY, bodyStr);
              this.wave.outputs.setOutput(OutputName.STATUS, code);
              if (st === "successful" || st === "success" || st === "done" || st === "completed") {
                break; // finished ok
              }
              if (st === "failed" || st === "error" || st === "canceled" || st === "cancelled") {
                throw new Error(`Job ${jobId} ended with state: ${st}`);
              }
            } catch {
              // No parseable state; just update outputs and continue polling
              this.wave.outputs.setOutput(OutputName.BODY, bodyStr);
              this.wave.outputs.setOutput(OutputName.STATUS, code);
            }
          }

          await new Promise((r) => setTimeout(r, delayMs));
        }
      }

      this.wave.outputs.setOutput(OutputName.RUN_TIME, Date.now() - started);
    } catch (e) {
      const ax = e as AxiosError;
      const status = ax.response?.status;
      if (status) this.wave.outputs.setOutput(OutputName.STATUS, Number(status));
      if (ax.response) {
        this.wave.outputs.setOutput(OutputName.HEADERS, ax.response.headers as any);
        this.wave.outputs.setOutput(OutputName.BODY, prettyBody(ax.response.data, ax.response.headers));
      }
      this.wave.outputs.setOutput(OutputName.RUN_TIME, Date.now() - started);
      throw e;
    }
  }
}

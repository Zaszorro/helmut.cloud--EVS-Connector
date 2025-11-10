// lib/nodes/EVSConnector.ts
import Node from "../Node";
import axios, { AxiosError, AxiosRequestConfig, AxiosResponse } from "axios";

type InputType = "STRING" | "STRING_PASSWORD" | "NUMBER" | "BOOLEAN";
type OutputType = "NUMBER" | "STRING" | "STRING_MAP" | "STRING_ARRAY";

enum InputName {
  HOST_URL = "HOST URL",
  TARGET_NAME = "Target Name",
  TARGET_ID = "TargetID",
  XSQUARE_PRIORITY = "XSquare priority",
  METADATASET_NAME = "Meadats set name", // keep exact label
  FILEPATH = "filepath",
  METADATA = "Metadaten", // keep exact label
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

type Metadata = {
  id?: string;
  name?: string;
  value?: string;
  values?: string[];
};

type JobDTO = {
  id?: string;
  name?: string;
  metadata?: Metadata[];
  // marker?: Marker[]; // omitted unless needed
  targetName?: string;
  targetId?: string;
  xsquarePriority?: string;
  metadatasetName?: string;
  fileToTransfer?: string;
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
  } catch {
    return "";
  }
}

async function postProgressive(url: string, json: string): Promise<AxiosResponse> {
  // Try with no headers first (mimic bare-bones clients)
  const profiles: Array<AxiosRequestConfig> = [
    { validateStatus: () => true, timeout: 60000, transformRequest: [(d) => d] },
    { headers: { "Content-Type": "application/json" }, validateStatus: () => true, timeout: 60000, transformRequest: [(d) => d] },
    { headers: { "Content-Type": "application/json; charset=UTF-8" }, validateStatus: () => true, timeout: 60000, transformRequest: [(d) => d] },
    { headers: { "Content-Type": "application/json; charset=utf-8" }, validateStatus: () => true, timeout: 60000, transformRequest: [(d) => d] },
  ];

  let last: AxiosResponse | null = null;
  for (const cfg of profiles) {
    const res = await axios.post(url, json, cfg);
    last = res;
    if (res.status !== 415) return res; // only escalate if Unsupported Media Type persists
  }
  return last!;
}

export default class EVSConnector extends Node {
  specification = {
    specVersion: 2,
    name: "EVS Connector",
    originalName: "EVS Connector",
    description: "Transfers a video file via EVS Connector API and creates a transfer job (POST /evsconn/v1/job).",
    kind: "NODE",
    category: "Transfer",
    color: "node-aquaGreen",
    version: { major: 1, minor: 3, patch: 0, changelog: ["Adapted to Java action semantics; progressive headers; Request output"] },
    author: { name: "Code Copilot", company: "Community", email: "n/a" },
    inputs: [
      { name: InputName.HOST_URL, description: "Base URL of the EVS Connector (no path).", type: "STRING" as InputType, example: "http://10.0.0.1:8084", mandatory: true },
      { name: InputName.TARGET_NAME, description: "XSquare target name.", type: "STRING" as InputType, example: "XSquareTarget", mandatory: true },
      { name: InputName.TARGET_ID, description: "XSquare target ID.", type: "STRING" as InputType, example: "123", mandatory: true },
      { name: InputName.XSQUARE_PRIORITY, description: "XSquare priority (optional).", type: "STRING" as InputType, example: "1", mandatory: false },
      { name: InputName.METADATASET_NAME, description: "Metadataset name (optional).", type: "STRING" as InputType, example: "DefaultSet", mandatory: false },
      { name: InputName.FILEPATH, description: "Full path to the video file to transfer.", type: "STRING" as InputType, example: "/mnt/media/input.mov", mandatory: true },
      { name: InputName.METADATA, description: "Metadata as JSON (array/object) or lines: key=value;key2=value2.", type: "STRING" as InputType, example: "title=Clip 01;show=Sports", mandatory: false },
    ],
    outputs: [
      { name: OutputName.STATUS, description: "HTTP status.", type: "NUMBER" as OutputType, example: 201 },
      { name: OutputName.HEADERS, description: "Response headers.", type: "STRING_MAP" as OutputType, example: { "content-type": "application/json" } },
      { name: OutputName.BODY, description: "Response body.", type: "STRING" as OutputType, example: "{ id: '...', jobId: '...' }" },
      { name: OutputName.RUN_TIME, description: "Execution time in milliseconds.", type: "NUMBER" as OutputType, example: 42 },
      { name: OutputName.JOB_ID, description: "Job ID reported by the server (if available).", type: "STRING" as OutputType, example: "a1b2c3" },
      { name: OutputName.REQUEST, description: "Exact JSON request body that was sent.", type: "STRING" as OutputType, example: "{\"name\":\"file.mov\"}" },
    ],
  };

  async execute(): Promise<void> {
    const started = Date.now();

    const baseUrl = normalizeBase(String(this.wave.inputs.getInputValueByInputName(InputName.HOST_URL) ?? ""));
    const targetName = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_NAME) ?? "").trim();
    const targetId = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_ID) ?? "").trim();
    const xsquarePriority = String(this.wave.inputs.getInputValueByInputName(InputName.XSQUARE_PRIORITY) ?? "").trim();
    const metadatasetName = String(this.wave.inputs.getInputValueByInputName(InputName.METADATASET_NAME) ?? "").trim();
    const fileToTransfer = String(this.wave.inputs.getInputValueByInputName(InputName.FILEPATH) ?? "").trim();
    const metadataRaw = String(this.wave.inputs.getInputValueByInputName(InputName.METADATA) ?? "");

    if (!baseUrl) throw new Error("HOST URL is required");
    if (!targetName) throw new Error("Target Name is required");
    if (!targetId) throw new Error("TargetID is required");
    if (!fileToTransfer) throw new Error("filepath is required");

    const url = `${baseUrl}/evsconn/v1/job`;
    const name = fileToTransfer.split(/[\\/]/).pop() || fileToTransfer;

    const metadata = parseMetadata(metadataRaw);
    const payload: JobDTO = clean({
      name,
      targetName,
      targetId,
      xsquarePriority,
      metadatasetName,
      fileToTransfer,
      metadata: metadata.length ? metadata : undefined,
    });

    const json = JSON.stringify(payload);
    this.wave.outputs.setOutput(OutputName.REQUEST, json);

    try {
      const res = await postProgressive(url, json);

      this.wave.outputs.setOutput(OutputName.STATUS, Number(res.status));
      this.wave.outputs.setOutput(OutputName.HEADERS, res.headers as any);
      this.wave.outputs.setOutput(OutputName.BODY, prettyBody(res.data, res.headers));
      this.wave.outputs.setOutput(OutputName.RUN_TIME, Date.now() - started);

      try {
        const jobId = extractJobId(res.data);
        this.wave.outputs.setOutput(OutputName.JOB_ID, jobId);
      } catch {}

      if (res.status >= 400) {
        throw new Error(`HTTP ${res.status} POST ${url}`);
      }
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

// lib/nodes/EVSConnector.ts
// NodeKit node for helmut.cloud High5 to create an EVS transfer job via EVS Connector API.
// Spec v2; built against the wave-nodes-catalog-blueprint + Swagger `evsconnectorswagger.json`.
//
// Minimal docs only where it matters ("why").

import Node from "../Node";
import axios, { AxiosError } from "axios";

// Keep types aligned with blueprint's other nodes
type InputType = "STRING" | "STRING_PASSWORD" | "NUMBER" | "BOOLEAN";
type OutputType = "NUMBER" | "STRING" | "STRING_MAP" | "STRING_ARRAY";

// Inputs requested by user (exact labels)
enum InputName {
  HOST_URL = "HOST URL",
  TARGET_NAME = "Target Name",
  TARGET_ID = "TargetID",
  XSQUARE_PRIORITY = "XSquare priority",
  METADATASET_NAME = "Meadats set name", // as provided; do not change to avoid breaking saved streams
  FILEPATH = "filepath",
  METADATA = "Metadaten",
}

// Outputs we expose
enum OutputName {
  JOB_ID = "jobId",
  HTTP_STATUS = "httpStatus",
  RESPONSE_JSON = "responseJson",
}

// Swagger types (partial) to keep payload shape clear
type JobDTO = {
  id?: string;
  name?: string;
  metadata?: Metadata[];
  marker?: Marker[];
  targetName?: string;
  targetId?: string;
  xsquarePriority?: string;
  metadatasetName?: string;
  fileToTransfer?: string;
};

type Marker = {
  name?: string;
  comments?: string;
  startPoint?: string;
  endPoint?: string;
  color?:
    | "GREEN"
    | "RED"
    | "PURPLE"
    | "ORANGE"
    | "YELLOW"
    | "WHITE"
    | "BLUE"
    | "TURQUOISE";
};

type Metadata = {
  id?: string;
  parent?: MetadataSetDTO[];
  name?: string;
  type?:
    | "STRING"
    | "INTEGER"
    | "BOOLEAN"
    | "DATE"
    | "DATETIME"
    | "TAG"
    | "TAG_ARRAY"
    | "TIME"
    | "AUTOCOMPLETE"
    | "SELECT"
    | "MULTISELECT"
    | "TYPEAHEAD"
    | "CHOOSE_FOLDER";
  values?: string[];
  value?: string;
  readonly?: boolean;
  mandatory?: boolean;
  disabled?: boolean;
  hide?: boolean;
  regex?: string;
  tags?: string[];
};

type MetadataSetDTO = {
  id?: string;
  name?: string;
  tags?: string[];
};

// Node spec v2
export default class EVSConnector extends Node {
  specification = {
    specVersion: 2,
    name: "EVS Connector",
    description:
      "Überträgt ein Videofile via EVS Connector API und erstellt einen Transfer-Job (POST /evsconn/v1/job). Unterstützt optionale Metadaten.",
    category: "Transfer",
    // Displayed inputs
    inputs: [
      {
        name: InputName.HOST_URL,
        type: "STRING" as InputType,
        required: true,
        helperText: "Basis-URL, z. B. http://host:8084",
        placeholder: "http://10.0.0.1:8084",
      },
      {
        name: InputName.TARGET_NAME,
        type: "STRING" as InputType,
        required: true,
        placeholder: "XSquare-Targetname",
      },
      {
        name: InputName.TARGET_ID,
        type: "STRING" as InputType,
        required: true,
        placeholder: "Target-ID",
      },
      {
        name: InputName.XSQUARE_PRIORITY,
        type: "STRING" as InputType,
        required: false,
        placeholder: "z. B. 1, 5, HIGH",
      },
      {
        name: InputName.METADATASET_NAME,
        type: "STRING" as InputType,
        required: false,
        placeholder: "XSquare Metadataset-Name",
      },
      {
        name: InputName.FILEPATH,
        type: "STRING" as InputType,
        required: true,
        helperText: "Voller Pfad zum zu transferierenden Video.",
        placeholder: "/mnt/media/input.mov",
      },
      {
        name: InputName.METADATA,
        type: "STRING" as InputType,
        required: false,
        helperText:
          "Entweder JSON (Array/Objekt) oder Zeilen im Format key=value. Beispiel: title=Clip 01\\nshow=Sports",
        placeholder:
          '[{"id":"title","value":"Clip 01"},{"id":"show","value":"Sports"}]',
        textarea: true,
      },
    ],
    outputs: [
      {
        name: OutputName.JOB_ID,
        type: "STRING" as OutputType,
        helperText: "Vom Connector vergebene Job-ID (falls vorhanden).",
      },
      {
        name: OutputName.HTTP_STATUS,
        type: "STRING" as OutputType,
      },
      {
        name: OutputName.RESPONSE_JSON,
        type: "STRING" as OutputType,
        helperText: "Serverantwort als JSON-String.",
      },
    ],
  };

  // ---- Helpers ----

  /** Parse metadata String to Swagger-compatible Metadata[].
   *  Why: EVS expects an array; users may provide JSON or simple key=value lines.
   */
  private parseMetadata(raw: string | undefined | null): Metadata[] {
    if (!raw) return [];
    const txt = String(raw).trim();
    if (!txt) return [];

    // Try JSON first
    try {
      const parsed = JSON.parse(txt);
      if (Array.isArray(parsed)) {
        return parsed as Metadata[];
      }
      if (parsed && typeof parsed === "object") {
        // Convert object map -> array
        return Object.entries(parsed as Record<string, string>).map(
          ([k, v]) => ({ id: k, value: String(v) })
        );
      }
    } catch {
      // fall through to line parsing
    }

    // Fallback: parse line-based `key=value`
    const out: Metadata[] = [];
    const lines = txt.split(/[\r\n;]+/).map((l) => l.trim()).filter(Boolean);
    for (const line of lines) {
      const m = line.match(/^\s*([^=:#]+)\s*[:=]\s*(.*)\s*$/);
      if (m) {
        const key = m[1].trim();
        const value = m[2].trim();
        out.push({ id: key, value });
      }
    }
    return out;
  }

  /** Try to extract a job id from arbitrary server response */
  private extractJobId(data: unknown): string {
    try {
      const obj = typeof data === "string" ? JSON.parse(data) : (data as any);
      return String(
        obj?.jobId ?? obj?.id ?? obj?.data?.id ?? obj?.data?.jobId ?? ""
      );
    } catch {
      return "";
    }
  }

  // ---- Execution ----
  async execute(): Promise<void> {
    const baseUrl = String(this.wave.inputs.getInput(InputName.HOST_URL) ?? "").trim();
    const targetName = String(this.wave.inputs.getInput(InputName.TARGET_NAME) ?? "").trim();
    const targetId = String(this.wave.inputs.getInput(InputName.TARGET_ID) ?? "").trim();
    const priority = String(this.wave.inputs.getInput(InputName.XSQUARE_PRIORITY) ?? "").trim();
    const metadatasetName = String(this.wave.inputs.getInput(InputName.METADATASET_NAME) ?? "").trim();
    const fileToTransfer = String(this.wave.inputs.getInput(InputName.FILEPATH) ?? "").trim();
    const metadataRaw = String(this.wave.inputs.getInput(InputName.METADATA) ?? "");

    if (!baseUrl) throw new Error("HOST URL ist erforderlich.");
    if (!fileToTransfer) throw new Error("filepath ist erforderlich.");
    if (!targetName) throw new Error("Target Name ist erforderlich.");
    if (!targetId) throw new Error("TargetID ist erforderlich.");

    const url = `${baseUrl.replace(/\/+$/, "")}/evsconn/v1/job`;

    // Der Name: sinnvoller Default = Dateiname
    const nameFromPath = fileToTransfer.split(/[\\/]/).pop() || fileToTransfer;

    const payload: JobDTO = {
      name: nameFromPath,
      targetName,
      targetId,
      xsquarePriority: priority || undefined,
      metadatasetName: metadatasetName || undefined,
      fileToTransfer,
      metadata: this.parseMetadata(metadataRaw),
    };

    this.wave.logger.info(`POST ${url}`);
    this.wave.logger.debug(`Payload: ${JSON.stringify(payload)}`);

    try {
      const res = await axios.post(url, payload, {
        headers: { "Content-Type": "application/json" },
        // timeout could be made configurable if needed
        timeout: 60_000,
        validateStatus: () => true, // we handle errors uniformly
      });

      // Set outputs
      const jobId = this.extractJobId(res.data);
      this.wave.outputs.setOutput(OutputName.JOB_ID, jobId);
      this.wave.outputs.setOutput(OutputName.HTTP_STATUS, String(res.status));
      try {
        const json =
          typeof res.data === "string" ? res.data : JSON.stringify(res.data);
        this.wave.outputs.setOutput(OutputName.RESPONSE_JSON, json);
      } catch {
        this.wave.outputs.setOutput(OutputName.RESPONSE_JSON, "");
      }

      if (res.status >= 400) {
        // Why: Make failures visible in wave logs & fail node for proper branching
        throw new Error(
          `HTTP ${res.status} while POST ${url} — ${typeof res.data === "string" ? res.data : JSON.stringify(res.data)}`
        );
      }
    } catch (err) {
      const ax = err as AxiosError;
      const status = ax.response?.status;
      if (status) this.wave.outputs.setOutput(OutputName.HTTP_STATUS, String(status));
      this.wave.logger.error(
        `EVS Connector Fehler: ${ax.message}; ` +
          (ax.response?.data
            ? `Body: ${typeof ax.response.data === "string" ? ax.response.data : JSON.stringify(ax.response.data)}`
            : "")
      );
      throw err;
    }
  }
}

// lib/nodes/EVSConnector.ts
import Node from "../Node";
import axios from "axios";

// --- Typen und Enums ---

type InputType = "STRING" | "STRING_PASSWORD" | "NUMBER" | "BOOLEAN" | "ENUM";
type OutputType = "NUMBER" | "STRING" | "STRING_MAP" | "JSON";

enum InputName {
  HOST_URL = "Host URL",
  TARGET_NAME = "Target Name",
  TARGET_ID = "Target ID",
  XSQ_PRIORITY = "XSquare Priority",
  METADATA_SET_NAME = "Metadata Set Name",
  FILEPATH = "Filepath",
  METADATA = "Metadata (JSON String)",
  MARKERS = "Markers (JSON String)",
}

enum OutputName {
  STATUS = "Status code",
  HEADERS = "Headers",
  BODY = "Body",
  RUN_TIME = "Run time",
  JOB_ID = "EVS Job ID",
}

// --- Hilfsfunktionen ---

/**
 * Stellt eine Wartezeit (Sleep) in Millisekunden bereit.
 */
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Normalisiert die Host-URL, um sicherzustellen, dass sie das Schema und den korrekten Pfad enthält.
 * (Basierend auf der Logik in EVSConnectorAction.java)
 */
function normalizeBase(hostUrl: string): string {
  let url = (hostUrl || "").trim().replace(/\/+$/g, ""); // Trimmen und / am Ende entfernen
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    url = "http://" + url;
  }
  if (url.endsWith("/evsconn/v1")) {
    return url;
  }
  return url + "/evsconn/v1";
}

/**
 * Formatiert den Response-Body für die Ausgabe.
 */
function prettyBody(data: any, headers: any): string {
  try {
    const ct = String(headers?.["content-type"] || "").toLowerCase();
    const isJson = typeof data === "object" || ct.includes("application/json");
    return isJson
      ? (typeof data === "string" ? JSON.stringify(JSON.parse(data), null, 2) : JSON.stringify(data, null, 2))
      : (typeof data === "string" ? data : String(data));
  } catch {
    return typeof data === "string" ? data : String(data);
  }
}

// --- Haupt-Node-Klasse ---

export default class EVSConnector extends Node {
  specification = {
    specVersion: 2,
    name: "EVS Connector", // Name der Node
    originalName: "EVS Connector",
    description: "Starts an EVS Connector job and monitors its progress.", // Beschreibung
    kind: "NODE",
    category: "EVS", // Kategorie (kann angepasst werden)
    color: "node-blue", // Farbe (kann angepasst werden)
    version: { major: 1, minor: 0, patch: 0, changelog: ["Initial release"] },
    author: {
      name: "David Merzenich", // Bitte anpassen
      company: "MoovIT SP",
      email: "d.merzenich@moovit-sp.com", // Bitte anpassen
    },
    inputs: [
      { name: InputName.HOST_URL, description: "EVS Connector Host URL (e.g., http://10.204.41.100:8084)", type: "STRING" as InputType, example: "http://10.204.41.100:8084", mandatory: true },
      { name: InputName.TARGET_NAME, description: "Destination system or logical target name.", type: "STRING" as InputType, example: "XSquare_Target", mandatory: true },
      { name: InputName.TARGET_ID, description: "Identifier of the destination target (e.g. xsquare target id).", type: "STRING" as InputType, example: "xs-target-123", mandatory: true },
      {
        name: InputName.XSQ_PRIORITY,
        description: "Optional priority value for XSquare.",
        type: "ENUM" as InputType,
        example: "Medium",
        mandatory: true,
        defaultValue: "Medium",
        options: [ // Basierend auf dem Java Enum
          { name: "High", value: "High" },
          { name: "Medium", value: "Medium" },
          { name: "Low", value: "Low" },
        ],
      },
      { name: InputName.METADATA_SET_NAME, description: "XSquare metadata profile name.", type: "STRING" as InputType, example: "default_profile", mandatory: true },
      { name: InputName.FILEPATH, description: "Path of the file to be transferred (Windows path format).", type: "STRING" as InputType, example: "D:\\Path\\To\\File.mxf", mandatory: true },
      { name: InputName.METADATA, description: "A JSON string representing the metadata array (see JobDTO).", type: "STRING" as InputType, example: "[{\"id\": \"title\", \"value\": \"My Video\"}]", mandatory: false, defaultValue: "[]" },
      { name: InputName.MARKERS, description: "A JSON string representing the marker array (see JobDTO).", type: "STRING" as InputType, example: "[{\"name\": \"Clip 1\", \"startPoint\": \"00:00:10:00:25/1\"}]", mandatory: false, defaultValue: "[]" },
    ],
    outputs: [
      { name: OutputName.STATUS, description: "HTTP status of the final poll", type: "NUMBER" as OutputType, example: 200 },
      { name: OutputName.HEADERS, description: "Response headers of the final poll", type: "STRING_MAP" as OutputType, example: { "content-type": "application/json" } },
      { name: OutputName.BODY, description: "Response body of the final successful poll", type: "JSON" as OutputType, example: "{ \"id\": \"...\", \"status\": \"successful\" }" },
      { name: OutputName.RUN_TIME, description: "Total execution time (ms)", type: "NUMBER" as OutputType, example: 42000 },
      { name: OutputName.JOB_ID, description: "The EVS Job ID", type: "STRING" as OutputType, example: "job_12345" },
    ],
  };

  async execute(): Promise<void> {
    const started = Date.now();

    // 1. Inputs abrufen
    const host = normalizeBase(String(this.wave.inputs.getInputValueByInputName(InputName.HOST_URL) ?? ""));
    const targetName = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_NAME) ?? "");
    const targetId = String(this.wave.inputs.getInputValueByInputName(InputName.TARGET_ID) ?? "");
    const xsquarePrio = String(this.wave.inputs.getInputValueByInputName(InputName.XSQ_PRIORITY) ?? "Medium");
    const metadataSetName = String(this.wave.inputs.getInputValueByInputName(InputName.METADATA_SET_NAME) ?? "");
    const filepath = String(this.wave.inputs.getInputValueByInputName(InputName.FILEPATH) ?? "");
    const metadataStr = String(this.wave.inputs.getInputValueByInputName(InputName.METADATA) ?? "[]");
    const markersStr = String(this.wave.inputs.getInputValueByInputName(InputName.MARKERS) ?? "[]");

    // 2. Kontext vom High5-Job abrufen (entspricht streamWorkerImpl.getJob() in Java)
    const evsJobId = this.wave.job?.id ?? `job_${Date.now()}`;
    const evsJobName = this.wave.job?.name ?? "Untitled EVS Job";

    // 3. JSON-Inputs parsen
    let metadata: any[];
    let markers: any[];
    try {
      metadata = JSON.parse(metadataStr);
    } catch (e) {
      throw new Error(`Failed to parse Metadata JSON: ${e.message}. Input was: ${metadataStr}`);
    }
    try {
      markers = JSON.parse(markersStr);
    } catch (e) {
      throw new Error(`Failed to parse Markers JSON: ${e.message}. Input was: ${markersStr}`);
    }

    // 4. Verbindungstest (wie in Java-Code)
    try {
      const infoRes = await axios.get(`${host}/info`, { timeout: 5000 });
      if (infoRes.status !== 200) throw new Error(`Connection test failed with status ${infoRes.status}`);
    } catch (e) {
      throw new Error(`Unable to connect to EVS at ${host}. Error: ${e.message}`);
    }

    // 5. JobDTO erstellen (basierend auf Swagger)
    const jobDTO = {
      id: evsJobId,
      name: evsJobName,
      metadata: metadata,
      marker: markers,
      targetName: targetName,
      targetId: targetId,
      xsquarePriority: xsquarePrio,
      metadatasetName: metadataSetName,
      fileToTransfer: filepath,
    };

    // 6. Job starten (POST /job)
    try {
      const postRes = await axios.post(`${host}/job`, jobDTO, {
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        validateStatus: () => true, // Alle Statuscodes selbst behandeln
      });

      // 409 bedeutet "Already exists", was in diesem Workflow ein Fehler ist
      if (postRes.status >= 400) {
        throw new Error(`HTTP ${postRes.status} ${postRes.statusText}. Body: ${prettyBody(postRes.data, postRes.headers)}`);
      }
    } catch (e) {
      throw new Error(`Unable to post job to EVS: ${e.message}`);
    }

    // 7. Polling-Schleife (Hauptlogik aus Java)
    try {
      while (true) {
        // HINWEIS: High5-Framework kümmert sich um Job-Abbruch von außen.
        // Die Java-Logik `if (streamWorkerImpl.isCanceled())` wird durch
        // das Beenden des Node-Prozesses durch High5 ersetzt.

        let statusRes;
        try {
          statusRes = await axios.get(`${host}/job/status/${evsJobId}`, {
            headers: { Accept: "application/json" },
            validateStatus: () => true,
            timeout: 5000, // Timeout für die Statusabfrage
          });

          if (statusRes.status >= 400) {
            throw new Error(`HTTP ${statusRes.status} while fetching job status.`);
          }
        } catch (pollError) {
          throw new Error(`Network error while polling job status: ${pollError.message}`);
        }

        const jobStatus = statusRes.data; // JobStatusDTO
        const statusText = (jobStatus?.status || "").toLowerCase();
        const detailsText = jobStatus?.details || "No details";

        // Status-Prüfung (wie in Java)
        if (statusText.includes("failed")) {
          throw new Error(`EVS job failed: ${detailsText}`);
        }

        if (statusText.includes("cancel")) {
          throw new Error(`EVS job was canceled: ${detailsText}`);
        }

        if (statusText.includes("successful")) {
          // Erfolg! Beende die Schleife und setze Outputs.
          this.wave.outputs.setOutput(OutputName.STATUS, statusRes.status);
          this.wave.outputs.setOutput(OutputName.HEADERS, statusRes.headers || {});
          this.wave.outputs.setOutput(OutputName.BODY, prettyBody(jobStatus, statusRes.headers));
          this.wave.outputs.setOutput(OutputName.RUN_TIME, Date.now() - started);
          this.wave.outputs.setOutput(OutputName.JOB_ID, evsJobId);
          return; // Beendet die execute-Methode erfolgreich
        }

        // Wenn "running" oder anderer Status: Warten und erneut versuchen
        await sleep(2000); // 2 Sekunden warten (im Java-Code waren es 1000ms)
      }
    } catch (pollError) {
      // Wenn die Polling-Schleife mit einem Fehler abbricht (z.B. "failed" Status),
      // versuchen wir, den Job im EVS-System zu stoppen (Cleanup).
      try {
        await axios.post(`${host}/job/stop/${evsJobId}`, null, {
          validateStatus: () => true,
          timeout: 3000,
        });
      } catch (stopError) {
        // Fehler beim Stoppen ignorieren, der ursprüngliche Fehler ist wichtiger
        console.error(`Failed to send stop command for job ${evsJobId} during cleanup: ${stopError.message}`);
      }
      
      // Den ursprünglichen Fehler weiterwerfen, damit die High5-Node fehlschlägt
      throw pollError;
    }
  }
}
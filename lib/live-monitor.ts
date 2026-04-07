import { promises as fs } from "node:fs";
import path from "node:path";

export type LiveMonitorEventKind =
  | "session"
  | "user"
  | "agent"
  | "analysis"
  | "latency"
  | "collection"
  | "outbound"
  | "appointment"
  | "error";

export type LiveMonitorChannel = "web" | "phone" | "system";
export type LiveMonitorLevel = "info" | "success" | "warning" | "error";

export type LiveMonitorEvent = {
  id: string;
  at: string;
  kind: LiveMonitorEventKind;
  channel: LiveMonitorChannel;
  level: LiveMonitorLevel;
  conversationId: string | null;
  message: string;
  details: Record<string, unknown> | null;
};

type AppendLiveMonitorEventInput = Omit<LiveMonitorEvent, "id" | "at"> & {
  id?: string;
  at?: string;
};

function buildArtifactsDir() {
  return path.resolve(process.cwd(), "artifacts", "live-monitor");
}

function buildLogPath(fileName = "events.ndjson") {
  return path.join(buildArtifactsDir(), fileName);
}

async function ensureLogFile(fileName = "events.ndjson") {
  const artifactsDir = buildArtifactsDir();
  const logPath = buildLogPath(fileName);
  await fs.mkdir(artifactsDir, { recursive: true });

  try {
    await fs.access(logPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.writeFile(logPath, "", "utf8");
      return logPath;
    }
    throw error;
  }

  return logPath;
}

function normalizeInput(input: AppendLiveMonitorEventInput): LiveMonitorEvent {
  return {
    id: input.id ?? `live-${crypto.randomUUID()}`,
    at: input.at ?? new Date().toISOString(),
    kind: input.kind,
    channel: input.channel,
    level: input.level,
    conversationId: input.conversationId ?? null,
    message: input.message,
    details: input.details ?? null,
  };
}

export async function appendLiveMonitorEvent(input: AppendLiveMonitorEventInput) {
  const event = normalizeInput(input);
  const logPath = await ensureLogFile();
  await fs.appendFile(logPath, `${JSON.stringify(event)}\n`, "utf8");
  return { event, logPath };
}

async function appendMonitorEventsToLog(
  inputs: AppendLiveMonitorEventInput[],
  fileName: string
) {
  if (inputs.length === 0) {
    const logPath = await ensureLogFile(fileName);
    return { events: [] as LiveMonitorEvent[], logPath };
  }

  const events = inputs.map(normalizeInput);
  const logPath = await ensureLogFile(fileName);
  await fs.appendFile(
    logPath,
    `${events.map((event) => JSON.stringify(event)).join("\n")}\n`,
    "utf8"
  );
  return { events, logPath };
}

export async function appendLiveMonitorEvents(inputs: AppendLiveMonitorEventInput[]) {
  return appendMonitorEventsToLog(inputs, "events.ndjson");
}

export async function appendImportedTranscriptMirrorEvents(
  inputs: AppendLiveMonitorEventInput[]
) {
  return appendMonitorEventsToLog(inputs, "imported-transcripts.ndjson");
}

export function getLiveMonitorLogPaths() {
  return {
    artifactsDir: buildArtifactsDir(),
    logPath: buildLogPath(),
    importedTranscriptLogPath: buildLogPath("imported-transcripts.ndjson"),
  };
}

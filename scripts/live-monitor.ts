import { promises as fs } from "node:fs";
import process from "node:process";

import { getLiveMonitorLogPaths, type LiveMonitorEvent } from "@/lib/live-monitor";

const POLL_INTERVAL_MS = 600;
const MAX_TEXT_WIDTH = 96;

const COLORS = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  magenta: "\u001b[35m",
  white: "\u001b[37m",
  bold: "\u001b[1m",
} as const;

function colorize(text: string, color: keyof typeof COLORS) {
  return `${COLORS[color]}${text}${COLORS.reset}`;
}

function timestampLabel(at: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date(at));
}

function kindLabel(event: LiveMonitorEvent) {
  switch (event.kind) {
    case "user":
      return colorize("USER ", "cyan");
    case "agent":
      return colorize("AGENT", "green");
    case "latency":
      return colorize("LAT  ", "magenta");
    case "analysis":
      return colorize("ANALY", "yellow");
    case "collection":
      return colorize("COLL ", "yellow");
    case "outbound":
      return colorize("CALL ", "cyan");
    case "appointment":
      return colorize("APPT ", "magenta");
    case "error":
      return colorize("ERROR", "red");
    default:
      return colorize("INFO ", "dim");
  }
}

function formatConversationId(conversationId: string | null) {
  if (!conversationId) {
    return colorize("------------", "dim");
  }
  return colorize(conversationId.slice(0, 12).padEnd(12, "."), "dim");
}

function wrapText(text: string, width = MAX_TEXT_WIDTH) {
  const normalized = text.replace(/\s+/g, " ").trim();
  if (normalized.length <= width) {
    return [normalized];
  }

  const lines: string[] = [];
  let cursor = 0;
  while (cursor < normalized.length) {
    let end = Math.min(cursor + width, normalized.length);
    if (end < normalized.length) {
      const lastSpace = normalized.lastIndexOf(" ", end);
      if (lastSpace > cursor + width * 0.55) {
        end = lastSpace;
      }
    }
    lines.push(normalized.slice(cursor, end).trim());
    cursor = end;
    while (normalized[cursor] === " ") {
      cursor += 1;
    }
  }

  return lines.filter(Boolean);
}

function formatValue(value: unknown, indent = 2): string[] {
  const prefix = " ".repeat(indent);

  if (value === null) {
    return [`${prefix}null`];
  }

  if (typeof value === "string") {
    return wrapText(value).map((line, index) =>
      index === 0 ? `${prefix}${line}` : `${prefix}${line}`
    );
  }

  if (typeof value === "number" || typeof value === "boolean" || typeof value === "bigint") {
    return [`${prefix}${String(value)}`];
  }

  if (Array.isArray(value)) {
    if (value.length === 0) {
      return [`${prefix}[]`];
    }

    const lines: string[] = [];
    for (const item of value) {
      const rendered = formatValue(item, indent + 2);
      lines.push(`${prefix}- ${rendered[0]?.trimStart() ?? ""}`);
      for (const continuation of rendered.slice(1)) {
        lines.push(continuation);
      }
    }
    return lines;
  }

  if (typeof value === "object") {
    const entries = Object.entries(value as Record<string, unknown>);
    if (entries.length === 0) {
      return [`${prefix}{}`];
    }

    const lines: string[] = [];
    for (const [key, item] of entries) {
      const rendered = formatValue(item, indent + 2);
      lines.push(`${prefix}${key}: ${rendered[0]?.trimStart() ?? ""}`);
      for (const continuation of rendered.slice(1)) {
        lines.push(continuation);
      }
    }
    return lines;
  }

  return [`${prefix}${String(value)}`];
}

function formatDetails(details: Record<string, unknown> | null) {
  if (!details || Object.keys(details).length === 0) {
    return [];
  }

  const lines: string[] = [colorize("  details", "white")];
  for (const [key, value] of Object.entries(details)) {
    const rendered = formatValue(value, 4);
    lines.push(`${colorize("    " + key + ":", "dim")} ${rendered[0]?.trimStart() ?? ""}`);
    for (const continuation of rendered.slice(1)) {
      lines.push(continuation);
    }
  }
  return lines;
}

function formatMessage(event: LiveMonitorEvent) {
  const raw = event.message.trim();
  if (!raw) {
    return ["  (no message)"];
  }
  return wrapText(raw).map((line) => `  ${line}`);
}

function renderEvent(event: LiveMonitorEvent) {
  const time = timestampLabel(event.at);
  const channel = event.channel.toUpperCase().padEnd(6, " ");
  const header = `${colorize(`[${time}]`, "dim")} ${kindLabel(event)} ${colorize(channel, "bold")} ${formatConversationId(event.conversationId)}`;
  const messageLines = formatMessage(event);
  const detailLines = formatDetails(event.details);
  return [header, ...messageLines, ...detailLines].join("\n");
}

async function ensureLogFile() {
  const { artifactsDir, logPath } = getLiveMonitorLogPaths();
  await fs.mkdir(artifactsDir, { recursive: true });
  try {
    await fs.access(logPath);
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      await fs.writeFile(logPath, "", "utf8");
    } else {
      throw error;
    }
  }
  return logPath;
}

async function main() {
  const showHistory = process.argv.includes("--history");
  const logPath = await ensureLogFile();
  const initialStats = await fs.stat(logPath);
  let position = showHistory ? 0 : initialStats.size;
  let remainder = "";

  process.stdout.write(`${colorize("Dental Live Monitor", "green")} ${colorize(logPath, "dim")}\n`);
  process.stdout.write(
    `${colorize("Mode:", "yellow")} ${showHistory ? "history + tail" : "tail only"}  ${colorize("Ctrl+C", "yellow")} to stop\n\n`
  );

  async function readNewContent() {
    const stats = await fs.stat(logPath);
    if (stats.size < position) {
      position = 0;
    }
    if (stats.size === position) {
      return;
    }

    const handle = await fs.open(logPath, "r");
    try {
      const buffer = Buffer.alloc(Number(stats.size - position));
      await handle.read(buffer, 0, buffer.length, position);
      position = stats.size;

      const chunk = remainder + buffer.toString("utf8");
      const lines = chunk.split(/\r?\n/);
      remainder = lines.pop() ?? "";

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed) {
          continue;
        }

        try {
          const event = JSON.parse(trimmed) as LiveMonitorEvent;
          process.stdout.write(`${renderEvent(event)}\n\n`);
        } catch {
          process.stdout.write(`${colorize("PARSE", "red")} ${trimmed}\n\n`);
        }
      }
    } finally {
      await handle.close();
    }
  }

  if (showHistory) {
    await readNewContent();
  }

  const interval = setInterval(() => {
    void readNewContent();
  }, POLL_INTERVAL_MS);

  process.on("SIGINT", () => {
    clearInterval(interval);
    process.stdout.write(`\n${colorize("Live monitor stopped.", "yellow")}\n`);
    process.exit(0);
  });
}

void main();

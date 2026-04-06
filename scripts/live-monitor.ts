import { promises as fs } from "node:fs";
import process from "node:process";

import { getLiveMonitorLogPaths, type LiveMonitorEvent } from "@/lib/live-monitor";

const POLL_INTERVAL_MS = 600;

const COLORS = {
  reset: "\u001b[0m",
  dim: "\u001b[2m",
  cyan: "\u001b[36m",
  green: "\u001b[32m",
  yellow: "\u001b[33m",
  red: "\u001b[31m",
  magenta: "\u001b[35m",
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
    return "------------";
  }
  return conversationId.slice(0, 12).padEnd(12, ".");
}

function renderEvent(event: LiveMonitorEvent) {
  const time = timestampLabel(event.at);
  const channel = event.channel.toUpperCase().padEnd(6, " ");
  return `[${time}] ${kindLabel(event)} ${channel} ${formatConversationId(event.conversationId)} ${event.message}`;
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

  process.stdout.write(
    `${colorize("Dental Live Monitor", "green")}  ${colorize(logPath, "dim")}\n`
  );
  process.stdout.write(
    `${colorize("Ctrl+C", "yellow")} で停止します。新しいイベントを待機します。\n\n`
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
          process.stdout.write(`${renderEvent(event)}\n`);
        } catch {
          process.stdout.write(`${colorize("PARSE ", "red")} ${trimmed}\n`);
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

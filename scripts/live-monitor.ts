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

function formatMs(value: unknown) {
  return typeof value === "number" ? `${value}ms` : "不明";
}

function formatBool(value: unknown, truthy: string, falsy: string) {
  if (value === true) {
    return truthy;
  }
  if (value === false) {
    return falsy;
  }
  return "不明";
}

function toRecord(details: Record<string, unknown> | null) {
  return details ?? {};
}

function labelColor(event: LiveMonitorEvent) {
  switch (event.kind) {
    case "user":
      return "cyan";
    case "agent":
      return "green";
    case "latency":
      return "magenta";
    case "analysis":
    case "collection":
    case "session":
      return "yellow";
    case "outbound":
      return "cyan";
    case "appointment":
      return "magenta";
    case "error":
      return "red";
    default:
      return "white";
  }
}

function eventLabel(event: LiveMonitorEvent) {
  switch (event.kind) {
    case "user":
      return "患者";
    case "agent":
      return event.details?.tentative === true ? "AI(仮応答)" : "AI";
    case "latency":
      return "応答速度";
    case "analysis":
      return "収集結果";
    case "collection":
      return "電話取込";
    case "outbound":
      return "発信";
    case "appointment":
      return "仮受付";
    case "error":
      return "エラー";
    default:
      return "状態";
  }
}

function translateMessage(message: string) {
  const exact: Record<string, string> = {
    "web conversation start requested": "Web会話を開始",
    "browser audio unlocked": "ブラウザ音声の準備完了",
    "browser audio still locked": "ブラウザ音声の準備待ち",
    "microphone permission granted": "マイク許可済み",
    "session started via webrtc": "WebRTCで接続開始",
    "session started via websocket": "WebSocketで接続開始",
    "webrtc failed, falling back to websocket": "WebRTC失敗のためWebSocketに切替",
    "websocket fallback connected": "WebSocketで接続完了",
    "conversation connected": "会話に接続",
    "conversation stop requested": "会話終了を要求",
    "analysis requested": "通話後の収集を開始",
    "analysis completed": "収集完了",
    "conversation fully processed": "処理完了",
    "web analysis requested": "Web会話の収集を開始",
    "phone import requested": "電話会話の取込を開始",
    "phone analysis imported": "電話会話の取込完了",
    "outbound requested": "発信を開始",
    "outbound accepted": "発信API受付完了",
    "appointment confirmation requested": "仮受付の確認を開始",
    "appointment draft confirmed": "仮受付の確認完了",
    "latency sample recorded": "応答速度を記録",
    "monitor ready": "モニター準備完了",
  };

  if (exact[message]) {
    return exact[message];
  }
  if (message.startsWith("conversation error: ")) {
    return `会話エラー: ${message.replace("conversation error: ", "")}`;
  }
  if (message.startsWith("analysis failed: ")) {
    return `収集失敗: ${message.replace("analysis failed: ", "")}`;
  }
  if (message.startsWith("start failed: ")) {
    return `開始失敗: ${message.replace("start failed: ", "")}`;
  }
  if (message.startsWith("stop or analysis failed: ")) {
    return `終了または収集失敗: ${message.replace("stop or analysis failed: ", "")}`;
  }
  if (message.startsWith("phone import failed: ")) {
    return `電話取込失敗: ${message.replace("phone import failed: ", "")}`;
  }
  if (message.startsWith("outbound failed: ")) {
    return `発信失敗: ${message.replace("outbound failed: ", "")}`;
  }
  if (message.startsWith("appointment confirmation failed: ")) {
    return `仮受付確認失敗: ${message.replace("appointment confirmation failed: ", "")}`;
  }
  return message;
}

function formatConversationId(conversationId: string | null) {
  if (!conversationId) {
    return "";
  }
  return `  会話ID: ${conversationId.slice(0, 12)}`;
}

function renderLines(lines: Array<string | null | undefined>) {
  return lines
    .filter((line): line is string => Boolean(line && line.trim()))
    .flatMap((line) => wrapText(line).map((wrapped) => `  ${wrapped}`));
}

function preferredSlotsSummary(value: unknown) {
  if (!Array.isArray(value) || value.length === 0) {
    return null;
  }
  const labels = value
    .map((slot) => {
      if (!slot || typeof slot !== "object") {
        return null;
      }
      const entry = slot as Record<string, unknown>;
      const date = typeof entry.date === "string" ? entry.date : null;
      const timeRange = typeof entry.timeRange === "string" ? entry.timeRange : null;
      return [date, timeRange].filter(Boolean).join(" ");
    })
    .filter((entry): entry is string => Boolean(entry));

  return labels.length > 0 ? labels.join(" / ") : null;
}

function detailLinesForEvent(event: LiveMonitorEvent) {
  const details = toRecord(event.details);

  switch (event.kind) {
    case "user":
    case "agent":
      return renderLines([
        event.kind === "agent"
          ? `応答まで: ${formatMs(details.replyAfterUserMs)}`
          : null,
        `経過: ${formatMs(details.elapsedMs)}`,
        event.kind === "agent" && details.tentative === true
          ? "種類: 仮応答"
          : event.kind === "agent"
            ? "種類: 本応答"
            : null,
      ]);
    case "latency":
      return renderLines([
        `接続完了まで: ${formatMs(details.connectMs)}`,
        `AI初回応答まで: ${formatMs(details.firstAgentResponseMs)}`,
        `患者発話からAI平均応答まで: ${formatMs(details.averageAgentReplyAfterUserMs)}`,
        `通話後の収集時間: ${formatMs(details.analysisMs)}`,
      ]);
    case "analysis":
      return renderLines([
        typeof details.transcriptSummary === "string"
          ? `要約: ${details.transcriptSummary}`
          : null,
        typeof details.serviceLine === "string" ? `受付区分: ${details.serviceLine}` : null,
        typeof details.triageLevel === "string" ? `緊急度: ${details.triageLevel}` : null,
        typeof details.patientName === "string" ? `患者名: ${details.patientName}` : null,
        typeof details.bookingStatus === "string" ? `予約状態: ${details.bookingStatus}` : null,
        typeof details.appointmentState === "string"
          ? `仮受付ステータス: ${details.appointmentState}`
          : null,
      ]);
    case "collection":
      return renderLines([
        typeof details.requestedConversationId === "string"
          ? `指定会話ID: ${details.requestedConversationId}`
          : null,
        typeof details.durationSecs === "number"
          ? `通話時間: ${details.durationSecs}秒`
          : null,
        typeof details.transcriptCount === "number"
          ? `文字起こし行数: ${details.transcriptCount}`
          : null,
        typeof details.serviceLine === "string" ? `受付区分: ${details.serviceLine}` : null,
        typeof details.triageLevel === "string" ? `緊急度: ${details.triageLevel}` : null,
        typeof details.patientName === "string" ? `患者名: ${details.patientName}` : null,
      ]);
    case "outbound":
      return renderLines([
        typeof details.toNumber === "string" ? `発信先: ${details.toNumber}` : null,
        typeof details.message === "string" ? `結果: ${details.message}` : null,
        typeof details.callSid === "string" ? `Call SID: ${details.callSid}` : null,
      ]);
    case "appointment":
      return renderLines([
        typeof details.patientName === "string" ? `患者名: ${details.patientName}` : null,
        typeof details.serviceLine === "string" ? `受付区分: ${details.serviceLine}` : null,
        typeof details.triageLevel === "string" ? `緊急度: ${details.triageLevel}` : null,
        typeof details.submissionState === "string"
          ? `登録状態: ${details.submissionState}`
          : null,
        preferredSlotsSummary(details.preferredSlots)
          ? `希望日時: ${preferredSlotsSummary(details.preferredSlots)}`
          : null,
      ]);
    case "session":
      return renderLines([
        typeof details.requestedTransport === "string"
          ? `接続方式: ${details.requestedTransport}`
          : null,
        typeof details.transport === "string" ? `接続方式: ${details.transport}` : null,
        details.connectMs !== undefined ? `接続完了まで: ${formatMs(details.connectMs)}` : null,
        Array.isArray(details.responseMetrics)
          ? `表示指標: ${details.responseMetrics.join(", ")}`
          : null,
        Array.isArray(details.transcript)
          ? `表示内容: ${details.transcript.join(", ")}`
          : null,
        typeof details.note === "string" ? details.note : null,
      ]);
    case "error":
      return renderLines([
        typeof details.message === "string" ? details.message : null,
      ]);
    default:
      return [];
  }
}

function renderEvent(event: LiveMonitorEvent) {
  const time = timestampLabel(event.at);
  const header = `${colorize(`[${time}]`, "dim")} ${colorize(eventLabel(event), labelColor(event))}`;
  const lines = [
    header,
    ...renderLines([translateMessage(event.message), formatConversationId(event.conversationId)]),
    ...detailLinesForEvent(event),
  ];
  return lines.join("\n");
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

  process.stdout.write(`${colorize("会話モニター", "green")} ${colorize(logPath, "dim")}\n`);
  process.stdout.write(
    `${colorize("表示モード:", "yellow")} ${showHistory ? "履歴あり" : "新着のみ"}  ${colorize("Ctrl+C", "yellow")} で停止\n\n`
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
          process.stdout.write(`${colorize("ログ解析失敗", "red")} ${trimmed}\n\n`);
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
    process.stdout.write(`\n${colorize("会話モニターを停止しました。", "yellow")}\n`);
    process.exit(0);
  });
}

void main();

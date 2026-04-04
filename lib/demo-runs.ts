import { promises as fs } from "node:fs";
import path from "node:path";

import { summarizeMissingMemoFields } from "@/lib/elevenlabs/memo";
import type { DemoRun } from "@/lib/types";

function formatInTimeZone(date: Date, timeZone: string) {
  const formatter = new Intl.DateTimeFormat("ja-JP", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  });

  const parts = formatter.formatToParts(date);
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";

  return {
    year: pick("year"),
    month: pick("month"),
    day: pick("day"),
    hour: pick("hour"),
    minute: pick("minute"),
    second: pick("second"),
    display: `${pick("year")}-${pick("month")}-${pick("day")} ${pick("hour")}:${pick("minute")}:${pick("second")} (${timeZone})`,
  };
}

function stringifyValue(value: string | boolean | null): string {
  if (value === null || value === "") {
    return "未取得";
  }
  if (typeof value === "boolean") {
    return value ? "はい" : "いいえ";
  }
  return value;
}

export function renderDemoRunMarkdown(run: DemoRun, timeZone: string): string {
  const missingFields = summarizeMissingMemoFields(run.memo);
  const importedAt = formatInTimeZone(new Date(run.importedAt), timeZone);

  return `# デモ証跡: ${run.conversationId}

## 概要
- 取り込み日時: ${importedAt.display}
- チャネル: ${run.channel}
- conversation_id: \`${run.conversationId}\`
- 会話ステータス: ${run.status}
- 通話開始: ${run.callMeta.startedAt ?? "不明"}
- 通話時間: ${run.callMeta.durationSecs ?? "不明"} 秒
- 発信/着信: ${run.callMeta.direction ?? "不明"}
- 発信先/着信元: ${run.callMeta.maskedCaller ?? "マスク済み情報なし"}
- AI 番号: ${run.callMeta.agentNumber ?? "未設定"}
- ElevenLabs reported cost: ${run.cost ?? "不明"}

## 仮受付メモ
- patient_name: ${stringifyValue(run.memo.patient_name)}
- phone_number: ${stringifyValue(run.memo.phone_number)}
- is_new_patient: ${stringifyValue(run.memo.is_new_patient)}
- visit_reason: ${stringifyValue(run.memo.visit_reason)}
- preferred_date_1: ${stringifyValue(run.memo.preferred_date_1)}
- preferred_time_range_1: ${stringifyValue(run.memo.preferred_time_range_1)}
- preferred_date_2: ${stringifyValue(run.memo.preferred_date_2)}
- preferred_time_range_2: ${stringifyValue(run.memo.preferred_time_range_2)}
- callback_ok: ${stringifyValue(run.memo.callback_ok)}
- unresolved_questions: ${stringifyValue(run.memo.unresolved_questions)}
- notes_for_staff: ${stringifyValue(run.memo.notes_for_staff)}
- booking_status: ${stringifyValue(run.memo.booking_status)}

## 要約
${run.analysis.transcriptSummary ?? "要約なし"}

## 評価
- call_successful: ${run.analysis.callSuccessful ?? "unknown"}
${run.analysis.evaluationCriteriaResults.length > 0 ? run.analysis.evaluationCriteriaResults.map(
  (item) =>
    `- ${item.criteriaId}: ${item.result ?? "unknown"}${item.rationale ? ` / ${item.rationale}` : ""}`
).join("\n") : "- 評価基準なし"}

## レイテンシ
- transport: ${run.latency?.transport ?? "unknown"}
- connect_ms: ${run.latency?.connectMs ?? "n/a"}
- first_agent_response_ms: ${run.latency?.firstAgentResponseMs ?? "n/a"}
- first_reply_after_user_ms: ${run.latency?.firstAgentReplyAfterUserMs ?? "n/a"}
- average_reply_after_user_ms: ${run.latency?.averageAgentReplyAfterUserMs ?? "n/a"}
- analysis_ms: ${run.latency?.analysisMs ?? "n/a"}
- measured_turns: ${run.latency?.measuredTurns ?? 0}

## 未取得項目
${missingFields.length > 0 ? missingFields.map((field) => `- ${field}`).join("\n") : "- なし"}

## 次アクション
- booking_status は常に仮受付として扱い、院内確認後に折り返す。
- unresolved_questions が残っている場合は人手確認を優先する。
- transcript の生データは JSON artifact を参照する。
`;
}

function buildFileStem(conversationId: string, timeZone: string): string {
  const formatted = formatInTimeZone(new Date(), timeZone);
  return `${formatted.year}-${formatted.month}-${formatted.day}-${formatted.hour}${formatted.minute}-${conversationId}`;
}

export async function writeDemoRunArtifacts(run: DemoRun, timeZone: string) {
  const docsDir = path.resolve(process.cwd(), "docs", "demo-runs");
  const artifactsDir = path.resolve(process.cwd(), "artifacts", "demo-runs");

  await fs.mkdir(docsDir, { recursive: true });
  await fs.mkdir(artifactsDir, { recursive: true });

  const stem = buildFileStem(run.conversationId, timeZone);
  const markdownPath = path.join(docsDir, `${stem}.md`);
  const jsonPath = path.join(artifactsDir, `${stem}.json`);

  await fs.writeFile(markdownPath, renderDemoRunMarkdown(run, timeZone), "utf8");
  await fs.writeFile(jsonPath, JSON.stringify(run, null, 2), "utf8");

  return {
    run,
    markdownPath,
    jsonPath,
  };
}

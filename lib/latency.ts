import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  ConversationChannel,
  ConversationTransport,
  LatencySample,
  TranscriptEntry,
} from "@/lib/types";

type LatencySampleInput = {
  conversationId: string;
  channel: ConversationChannel;
  transport: ConversationTransport;
  transcript: TranscriptEntry[];
  connectMs?: number | null;
  firstAgentResponseMs?: number | null;
  analysisMs?: number | null;
};

type ReplyLatencySummary = {
  firstAgentReplyAfterUserMs: number | null;
  averageAgentReplyAfterUserMs: number | null;
  measuredTurns: number;
};

function buildSampleId(
  conversationId: string,
  channel: ConversationChannel,
  transport: ConversationTransport
) {
  return `${conversationId}:${channel}:${transport}`;
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

export function summarizeReplyLatency(transcript: TranscriptEntry[]): ReplyLatencySummary {
  const replyLatencies: number[] = [];
  let pendingUserTimeInCallSecs: number | null = null;

  for (const entry of transcript) {
    if (typeof entry.timeInCallSecs !== "number") {
      continue;
    }

    if (entry.role === "user") {
      pendingUserTimeInCallSecs = entry.timeInCallSecs;
      continue;
    }

    if (entry.role === "agent" && pendingUserTimeInCallSecs !== null) {
      const deltaMs = Math.round((entry.timeInCallSecs - pendingUserTimeInCallSecs) * 1000);
      if (deltaMs >= 0) {
        replyLatencies.push(deltaMs);
      }
      pendingUserTimeInCallSecs = null;
    }
  }

  return {
    firstAgentReplyAfterUserMs: replyLatencies[0] ?? null,
    averageAgentReplyAfterUserMs: average(replyLatencies),
    measuredTurns: replyLatencies.length,
  };
}

export function buildLatencySample(input: LatencySampleInput): LatencySample {
  const replyLatency = summarizeReplyLatency(input.transcript);

  return {
    sampleId: buildSampleId(input.conversationId, input.channel, input.transport),
    recordedAt: new Date().toISOString(),
    conversationId: input.conversationId,
    channel: input.channel,
    transport: input.transport,
    connectMs: input.connectMs ?? null,
    firstAgentResponseMs: input.firstAgentResponseMs ?? null,
    firstAgentReplyAfterUserMs: replyLatency.firstAgentReplyAfterUserMs,
    averageAgentReplyAfterUserMs: replyLatency.averageAgentReplyAfterUserMs,
    measuredTurns: replyLatency.measuredTurns,
    analysisMs: input.analysisMs ?? null,
  };
}

function formatAverage(samples: number[]) {
  const value = average(samples);
  return value === null ? "n/a" : `${value} ms`;
}

function filterValues(
  samples: LatencySample[],
  pick: (sample: LatencySample) => number | null
): number[] {
  return samples
    .map(pick)
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
}

function renderLatencySummaryMarkdown(samples: LatencySample[]): string {
  const webSamples = samples.filter((sample) => sample.channel === "web");
  const phoneSamples = samples.filter((sample) => sample.channel === "phone");
  const recentSamples = [...samples]
    .sort((left, right) => right.recordedAt.localeCompare(left.recordedAt))
    .slice(0, 15);

  return `# Latency Summary

## Overview
- total_samples: ${samples.length}
- web_samples: ${webSamples.length}
- phone_samples: ${phoneSamples.length}
- avg_connect_ms: ${formatAverage(filterValues(samples, (sample) => sample.connectMs))}
- avg_first_agent_response_ms: ${formatAverage(
    filterValues(samples, (sample) => sample.firstAgentResponseMs)
  )}
- avg_reply_after_user_ms: ${formatAverage(
    filterValues(samples, (sample) => sample.averageAgentReplyAfterUserMs)
  )}
- avg_analysis_ms: ${formatAverage(filterValues(samples, (sample) => sample.analysisMs))}

## Recent Samples
${recentSamples.length > 0
    ? recentSamples
        .map(
          (sample) =>
            `- ${sample.recordedAt} / ${sample.channel} / ${sample.transport} / ${sample.conversationId} / connect=${sample.connectMs ?? "n/a"} ms / first_agent=${sample.firstAgentResponseMs ?? "n/a"} ms / reply_after_user=${sample.averageAgentReplyAfterUserMs ?? "n/a"} ms / analysis=${sample.analysisMs ?? "n/a"} ms / turns=${sample.measuredTurns}`
        )
        .join("\n")
    : "- no samples yet"}
`;
}

async function readLatencySamples(filePath: string): Promise<LatencySample[]> {
  try {
    const raw = await fs.readFile(filePath, "utf8");
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as LatencySample[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

export async function writeLatencySample(sample: LatencySample) {
  const artifactsDir = path.resolve(process.cwd(), "artifacts", "latency");
  const docsDir = path.resolve(process.cwd(), "docs");
  const jsonPath = path.join(artifactsDir, "latency-samples.json");
  const markdownPath = path.join(docsDir, "latency-report.md");

  await fs.mkdir(artifactsDir, { recursive: true });
  await fs.mkdir(docsDir, { recursive: true });

  const existing = await readLatencySamples(jsonPath);
  const deduped = existing.filter((item) => item.sampleId !== sample.sampleId);
  const next = [...deduped, sample].sort((left, right) =>
    left.recordedAt.localeCompare(right.recordedAt)
  );

  await fs.writeFile(jsonPath, JSON.stringify(next, null, 2), "utf8");
  await fs.writeFile(markdownPath, renderLatencySummaryMarkdown(next), "utf8");

  return {
    sample,
    jsonPath,
    markdownPath,
  };
}

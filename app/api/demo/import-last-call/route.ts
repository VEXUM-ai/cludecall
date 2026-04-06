import { NextResponse } from "next/server";
import { z } from "zod";

import { ElevenLabsApiError, importLatestPhoneCall } from "@/lib/elevenlabs/api";
import { appendLiveMonitorEvent, appendLiveMonitorEvents } from "@/lib/live-monitor";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
  })
  .optional();

export async function POST(request: Request) {
  try {
    const json =
      request.headers.get("content-length") === "0" ? undefined : await request.json();
    const body = requestSchema.parse(json);
    await appendLiveMonitorEvent({
      kind: "collection",
      channel: "phone",
      level: "info",
      conversationId: body?.conversationId ?? null,
      message: "最新の電話会話の収集を開始",
      details: { requestedConversationId: body?.conversationId ?? null },
    });
    const run = await importLatestPhoneCall(body?.conversationId);
    await appendLiveMonitorEvent({
      kind: "collection",
      channel: "phone",
      level: "success",
      conversationId: run.conversationId,
      message: run.analysis.transcriptSummary ?? "電話会話の収集が完了",
      details: {
        durationSecs: run.callMeta.durationSecs,
        source: run.channel,
        analysisMs: run.latency?.analysisMs ?? null,
      },
    });
    await appendLiveMonitorEvents(
      run.transcript.map((entry) => ({
        kind: entry.role === "agent" ? "agent" : "user",
        channel: "phone" as const,
        level: "info" as const,
        conversationId: run.conversationId,
        message: entry.text,
        details: {
          tentative: entry.tentative,
          timeInCallSecs: entry.timeInCallSecs,
        },
      }))
    );
    return NextResponse.json(run);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "conversationId must be a non-empty string when provided." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to import the latest phone call.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "phone",
      level: "error",
      conversationId: null,
      message: `電話会話の収集失敗: ${message}`,
      details: null,
    });

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

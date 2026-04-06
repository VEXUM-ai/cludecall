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

function queueTranscriptMirror(run: Awaited<ReturnType<typeof importLatestPhoneCall>>) {
  void appendLiveMonitorEvents(
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
  ).catch(async (error) => {
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "phone",
      level: "error",
      conversationId: run.conversationId,
      message: `phone transcript mirror failed: ${
        error instanceof Error ? error.message : String(error)
      }`,
      details: null,
    });
  });
}

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
      message: "phone import requested",
      details: { requestedConversationId: body?.conversationId ?? null },
    });

    const run = await importLatestPhoneCall(body?.conversationId);
    const lastTranscriptTimeInCallSecs =
      run.transcript.length > 0 ? run.transcript[run.transcript.length - 1]?.timeInCallSecs : null;
    const transcriptTailGapSecs =
      typeof run.callMeta.durationSecs === "number" && typeof lastTranscriptTimeInCallSecs === "number"
        ? Math.max(run.callMeta.durationSecs - lastTranscriptTimeInCallSecs, 0)
        : null;

    await appendLiveMonitorEvent({
      kind: "collection",
      channel: "phone",
      level: "success",
      conversationId: run.conversationId,
      message: "phone analysis imported",
      details: {
        durationSecs: run.callMeta.durationSecs,
        source: run.channel,
        status: run.status,
        success: run.analysis.callSuccessful,
        transcriptCount: run.transcript.length,
        analysisMs: run.latency?.analysisMs ?? null,
        analysisRequestMs: run.analysisResolution?.analysisRequestMs ?? null,
        pollingAttempts: run.analysisResolution?.pollingAttempts ?? null,
        pollingWaitMs: run.analysisResolution?.pollingWaitMs ?? null,
        detailFetchCount: run.analysisResolution?.detailFetchCount ?? null,
        detailFetchMs: run.analysisResolution?.detailFetchMs ?? null,
        serviceLine: run.memo.service_line,
        triageLevel: run.memo.triage_level,
        patientName: run.memo.patient_name,
        patientNameYomi: run.memo.patient_name_yomi,
        lastTranscriptTimeInCallSecs,
        transcriptTailGapSecs,
      },
    });

    if (typeof transcriptTailGapSecs === "number" && transcriptTailGapSecs >= 15) {
      await appendLiveMonitorEvent({
        kind: "collection",
        channel: "phone",
        level: "warning",
        conversationId: run.conversationId,
        message: "phone transcript ended well before call completion",
        details: {
          durationSecs: run.callMeta.durationSecs,
          lastTranscriptTimeInCallSecs,
          transcriptTailGapSecs,
        },
      });
    }

    queueTranscriptMirror(run);

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
      message: `phone import failed: ${message}`,
      details: null,
    });

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

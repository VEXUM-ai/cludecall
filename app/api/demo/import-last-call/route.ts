import { NextResponse } from "next/server";
import { z } from "zod";

import { runDirectAutoAppointmentFlow } from "@/lib/appointment-automation";
import { ElevenLabsApiError, importLatestPhoneCall } from "@/lib/elevenlabs/api";
import {
  appendImportedTranscriptMirrorEvents,
  appendLiveMonitorEvent,
} from "@/lib/live-monitor";
import { assessTranscriptTailCoverage } from "@/lib/phone-call-quality";

export const runtime = "nodejs";

const requestSchema = z
  .object({
    conversationId: z.string().min(1).optional(),
  })
  .optional();

function queueTranscriptMirror(run: Awaited<ReturnType<typeof importLatestPhoneCall>>) {
  void appendImportedTranscriptMirrorEvents(
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
    const automation = await runDirectAutoAppointmentFlow(run.conversationId);
    const nextRun =
      automation.detail.conversationId === run.conversationId ? automation.detail : run;
    const tailCoverage = assessTranscriptTailCoverage({
      durationSecs: nextRun.callMeta.durationSecs,
      transcript: nextRun.transcript,
    });
    const lastTranscriptRole = tailCoverage.lastTranscriptEntry?.role ?? null;
    const lastTranscriptPreview =
      tailCoverage.lastTranscriptEntry?.text?.slice(0, 160) ?? null;

    await appendLiveMonitorEvent({
      kind: "collection",
      channel: "phone",
      level: "success",
      conversationId: nextRun.conversationId,
      message: "phone analysis imported",
      details: {
        durationSecs: nextRun.callMeta.durationSecs,
        source: nextRun.channel,
        status: nextRun.status,
        success: nextRun.analysis.callSuccessful,
        transcriptCount: nextRun.transcript.length,
        analysisMs: nextRun.latency?.analysisMs ?? null,
        analysisRequestMs: nextRun.analysisResolution?.analysisRequestMs ?? null,
        pollingAttempts: nextRun.analysisResolution?.pollingAttempts ?? null,
        pollingWaitMs: nextRun.analysisResolution?.pollingWaitMs ?? null,
        detailFetchCount: nextRun.analysisResolution?.detailFetchCount ?? null,
        detailFetchMs: nextRun.analysisResolution?.detailFetchMs ?? null,
        serviceLine: nextRun.memo.service_line,
        triageLevel: nextRun.memo.triage_level,
        patientName: nextRun.memo.patient_name,
        patientNameYomi: nextRun.memo.patient_name_yomi,
        lastTranscriptTimeInCallSecs: tailCoverage.lastTranscriptTimeInCallSecs,
        transcriptTailGapSecs: tailCoverage.transcriptTailGapSecs,
        lastTranscriptRole,
        lastTranscriptPreview,
        tailCoverageRequired: tailCoverage.tailCoverageRequired,
        tailCoverageReasons: tailCoverage.reasons,
        conversationOutcome: nextRun.appointmentDraft?.conversationOutcome ?? null,
        notificationState: nextRun.appointmentDraft?.notificationState ?? null,
        automationReason: automation.reason,
      },
    });

    if (tailCoverage.tailCoverageRequired) {
      await appendLiveMonitorEvent({
        kind: "error",
        channel: "phone",
        level: "error",
        conversationId: nextRun.conversationId,
        message: "tail coverage required",
        details: {
          durationSecs: nextRun.callMeta.durationSecs,
          lastTranscriptTimeInCallSecs: tailCoverage.lastTranscriptTimeInCallSecs,
          transcriptTailGapSecs: tailCoverage.transcriptTailGapSecs,
          lastTranscriptRole,
          lastTranscriptPreview,
          tailCoverageReasons: tailCoverage.reasons,
        },
      });
    }

    queueTranscriptMirror(nextRun);

    return NextResponse.json(nextRun);
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

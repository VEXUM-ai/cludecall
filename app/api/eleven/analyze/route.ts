import { NextResponse } from "next/server";
import { z } from "zod";

import { runDirectAutoAppointmentFlow } from "@/lib/appointment-automation";
import { analyzeConversation, ElevenLabsApiError } from "@/lib/elevenlabs/api";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

const requestSchema = z.object({
  conversationId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    await appendLiveMonitorEvent({
      kind: "collection",
      channel: "web",
      level: "info",
      conversationId: body.conversationId,
      message: "web analysis requested",
      details: null,
    });

    const result = await analyzeConversation(body.conversationId);
    const automation = await runDirectAutoAppointmentFlow(body.conversationId);
    const nextResult =
      automation.detail.conversationId === body.conversationId ? automation.detail : result;

    await appendLiveMonitorEvent({
      kind: "analysis",
      channel: "web",
      level: "success",
      conversationId: body.conversationId,
      message: "analysis completed",
      details: {
        status: nextResult.status,
        success: nextResult.analysis.callSuccessful,
        transcriptSummary: nextResult.analysis.transcriptSummary,
        serviceLine: nextResult.memo.service_line,
        triageLevel: nextResult.memo.triage_level,
        patientName: nextResult.memo.patient_name,
        patientNameYomi: nextResult.memo.patient_name_yomi,
        bookingStatus: nextResult.memo.booking_status,
        appointmentState: nextResult.appointmentDraft?.submissionState ?? null,
        conversationOutcome: nextResult.appointmentDraft?.conversationOutcome ?? null,
        notificationState: nextResult.appointmentDraft?.notificationState ?? null,
        analysisRequestMs: result.analysisResolution?.analysisRequestMs ?? null,
        pollingAttempts: result.analysisResolution?.pollingAttempts ?? null,
        pollingWaitMs: result.analysisResolution?.pollingWaitMs ?? null,
        detailFetchCount: result.analysisResolution?.detailFetchCount ?? null,
        detailFetchMs: result.analysisResolution?.detailFetchMs ?? null,
        analysisTotalMs: result.analysisResolution?.totalMs ?? null,
        automationReason: automation.reason,
      },
    });

    return NextResponse.json(nextResult);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "conversationId is required." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to analyze conversation.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "web",
      level: "error",
      conversationId: null,
      message: `analysis failed: ${message}`,
      details: null,
    });

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

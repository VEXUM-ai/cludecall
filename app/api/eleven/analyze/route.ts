import { NextResponse } from "next/server";
import { z } from "zod";

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

    await appendLiveMonitorEvent({
      kind: "analysis",
      channel: "web",
      level: "success",
      conversationId: body.conversationId,
      message: "analysis completed",
      details: {
        status: result.status,
        success: result.analysis.callSuccessful,
        transcriptSummary: result.analysis.transcriptSummary,
        serviceLine: result.memo.service_line,
        triageLevel: result.memo.triage_level,
        patientName: result.memo.patient_name,
        patientNameYomi: result.memo.patient_name_yomi,
        bookingStatus: result.memo.booking_status,
        appointmentState: result.appointmentDraft?.submissionState ?? null,
        analysisRequestMs: result.analysisResolution?.analysisRequestMs ?? null,
        pollingAttempts: result.analysisResolution?.pollingAttempts ?? null,
        pollingWaitMs: result.analysisResolution?.pollingWaitMs ?? null,
        detailFetchCount: result.analysisResolution?.detailFetchCount ?? null,
        detailFetchMs: result.analysisResolution?.detailFetchMs ?? null,
        analysisTotalMs: result.analysisResolution?.totalMs ?? null,
      },
    });

    return NextResponse.json(result);
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

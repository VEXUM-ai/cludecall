import { NextResponse } from "next/server";
import { z } from "zod";

import { checkAvailabilityWithProvider } from "@/lib/appointment-tool/provider";
import { writeStoredAppointmentDraft } from "@/lib/appointment-store";
import { syncStoredAppointmentDraft } from "@/lib/demo-runs";
import { getServerConfig } from "@/lib/env";
import {
  ElevenLabsApiError,
  getConversationHistoryDetail,
} from "@/lib/elevenlabs/api";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

const requestSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required."),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "system",
      level: "info",
      conversationId: body.conversationId,
      message: "appointment availability requested",
      details: null,
    });

    const detail = await getConversationHistoryDetail(body.conversationId);
    if (!detail.appointmentDraft) {
      return NextResponse.json(
        { error: "No appointment draft is available for this conversation." },
        { status: 409 }
      );
    }

    const result = await checkAvailabilityWithProvider(detail.appointmentDraft);
    await writeStoredAppointmentDraft(result.draft);
    await syncStoredAppointmentDraft(result.draft, getServerConfig().demoTimezone);

    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: detail.channel,
      level: result.candidates.length > 0 ? "success" : "warning",
      conversationId: body.conversationId,
      message:
        result.candidates.length > 0
          ? "appointment availability resolved"
          : "appointment availability requires manual follow-up",
      details: {
        candidateCount: result.candidates.length,
        executionState: result.draft.executionState,
        executionError: result.draft.executionError,
        auditId: result.auditRef?.auditId ?? null,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "conversationId is required." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to resolve appointment availability.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "system",
      level: "error",
      conversationId: null,
      message: `appointment availability failed: ${message}`,
      details: null,
    });

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

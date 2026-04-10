import { NextResponse } from "next/server";

import { runDirectAutoAppointmentFlow } from "@/lib/appointment-automation";
import { reanalyzeConversationHistoryDetail } from "@/lib/elevenlabs/api";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

function extractConversationId(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const source = payload as Record<string, unknown>;
  const direct =
    typeof source.conversation_id === "string"
      ? source.conversation_id
      : typeof source.conversationId === "string"
        ? source.conversationId
        : null;
  if (direct) {
    return direct;
  }

  const nestedCandidates = [source.data, source.event, source.conversation];
  for (const candidate of nestedCandidates) {
    const extracted = extractConversationId(candidate);
    if (extracted) {
      return extracted;
    }
  }

  return null;
}

export async function POST(request: Request) {
  try {
    const body =
      request.headers.get("content-length") === "0" ? {} : await request.json();
    const conversationId = extractConversationId(body);

    if (!conversationId) {
      return NextResponse.json(
        { error: "conversation_id is required." },
        { status: 400 }
      );
    }

    await appendLiveMonitorEvent({
      kind: "collection",
      channel: "system",
      level: "info",
      conversationId,
      message: "post-call webhook received",
      details: null,
    });

    await reanalyzeConversationHistoryDetail(conversationId);
    const automation = await runDirectAutoAppointmentFlow(conversationId);

    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "system",
      level: automation.automated ? "success" : "warning",
      conversationId,
      message: automation.automated
        ? "post-call automation completed"
        : "post-call automation finished without auto-booking",
      details: {
        reason: automation.reason,
        conversationOutcome: automation.detail.appointmentDraft?.conversationOutcome ?? null,
        notificationState: automation.detail.appointmentDraft?.notificationState ?? null,
      },
    });

    return NextResponse.json({
      ok: true,
      conversationId,
      detail: automation.detail,
      automation,
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to process post-call webhook.";

    await appendLiveMonitorEvent({
      kind: "error",
      channel: "system",
      level: "error",
      conversationId: null,
      message: `post-call webhook failed: ${message}`,
      details: null,
    });

    return NextResponse.json({ error: message }, { status: 500 });
  }
}

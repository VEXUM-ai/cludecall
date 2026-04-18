import { NextResponse } from "next/server";

import { prewarmApotoolSession } from "@/lib/appointment-tool/apotool-rpa/session-manager";
import { isAuthorizedAppointmentToolWebhookRequest } from "@/lib/appointment-tool/live-tool-webhook";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    if (!isAuthorizedAppointmentToolWebhookRequest(request)) {
      await appendLiveMonitorEvent({
        kind: "error",
        channel: "system",
        level: "warning",
        conversationId: null,
        message: "appointment tool prewarm rejected: unauthorized request",
        details: null,
      });
      return NextResponse.json({ error: "Unauthorized prewarm request." }, { status: 401 });
    }

    const page = await prewarmApotoolSession();
    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "system",
      level: "success",
      conversationId: null,
      message: "appointment tool prewarm completed",
      details: {
        url: page.url(),
      },
    });

    return NextResponse.json({
      success: true,
      url: page.url(),
    });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to prewarm the appointment tool session.";
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "system",
      level: "error",
      conversationId: null,
      message: `appointment tool prewarm failed: ${message}`,
      details: null,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

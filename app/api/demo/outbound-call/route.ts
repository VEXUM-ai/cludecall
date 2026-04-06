import { NextResponse } from "next/server";
import { z } from "zod";

import { ElevenLabsApiError, startOutboundCall } from "@/lib/elevenlabs/api";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

const requestSchema = z.object({
  toNumber: z.string().min(3, "toNumber must be a non-empty phone number."),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    await appendLiveMonitorEvent({
      kind: "outbound",
      channel: "phone",
      level: "info",
      conversationId: null,
      message: "outbound requested",
      details: { toNumber: body.toNumber },
    });

    const result = await startOutboundCall(body.toNumber);

    await appendLiveMonitorEvent({
      kind: "outbound",
      channel: "phone",
      level: result.success ? "success" : "warning",
      conversationId: result.conversationId,
      message: "outbound accepted",
      details: {
        callSid: result.callSid,
        toNumber: result.toNumber,
        message: result.message,
        twilioAccountType: result.twilioAccountType,
        warnings: result.warnings,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid phone number." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to start the outbound call.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "phone",
      level: "error",
      conversationId: null,
      message: `outbound failed: ${message}`,
      details: null,
    });

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

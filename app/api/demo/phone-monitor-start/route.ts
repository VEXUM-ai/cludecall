import { NextResponse } from "next/server";
import { z } from "zod";

import {
  ElevenLabsApiError,
  findMostRecentActivePhoneConversationId,
} from "@/lib/elevenlabs/api";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";
import { startPhoneConversationMonitor } from "@/lib/phone-live-monitor";

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
    const conversationId =
      body?.conversationId ?? (await findMostRecentActivePhoneConversationId());
    const result = await startPhoneConversationMonitor(conversationId);

    await appendLiveMonitorEvent({
      kind: "session",
      channel: "phone",
      level: "success",
      conversationId,
      message: "phone realtime monitor attach requested",
      details: {
        alreadyActive: result.alreadyActive,
      },
    });

    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "conversationId must be a non-empty string when provided." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error
        ? error.message
        : "Failed to start phone realtime monitoring.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;

    await appendLiveMonitorEvent({
      kind: "error",
      channel: "phone",
      level: "error",
      conversationId: null,
      message: `phone realtime monitor attach failed: ${message}`,
      details: null,
    });

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

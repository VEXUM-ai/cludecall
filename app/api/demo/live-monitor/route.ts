import { NextResponse } from "next/server";
import { z } from "zod";

import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

const requestSchema = z.object({
  kind: z.enum([
    "session",
    "user",
    "agent",
    "analysis",
    "latency",
    "collection",
    "outbound",
    "appointment",
    "error",
  ]),
  channel: z.enum(["web", "phone", "system"]).default("system"),
  level: z.enum(["info", "success", "warning", "error"]).default("info"),
  conversationId: z.string().nullable().optional(),
  message: z.string().min(1),
  details: z.record(z.string(), z.unknown()).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await appendLiveMonitorEvent({
      ...body,
      conversationId: body.conversationId ?? null,
      details: body.details ?? null,
    });
    return NextResponse.json({
      ok: true,
      event: result.event,
      logPath: result.logPath,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid live monitor payload." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to append live monitor event.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { buildLatencySample, writeLatencySample } from "@/lib/latency";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

const transcriptEntrySchema = z.object({
  id: z.string(),
  role: z.enum(["user", "agent"]),
  text: z.string(),
  tentative: z.boolean(),
  timeInCallSecs: z.number().nullable(),
});

const requestSchema = z.object({
  conversationId: z.string().min(1),
  channel: z.enum(["web", "phone"]),
  transport: z.enum(["webrtc", "websocket", "telephony", "unknown"]),
  connectMs: z.number().nonnegative().nullable().optional(),
  firstAgentResponseMs: z.number().nonnegative().nullable().optional(),
  analysisMs: z.number().nonnegative().nullable().optional(),
  transcript: z.array(transcriptEntrySchema),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const sample = buildLatencySample(body);
    const result = await writeLatencySample(sample);
    await appendLiveMonitorEvent({
      kind: "latency",
      channel: body.channel,
      level: "info",
      conversationId: body.conversationId,
      message: `latency connect=${sample.connectMs ?? "n/a"}ms / firstAgent=${sample.firstAgentResponseMs ?? "n/a"}ms / avgReply=${sample.averageAgentReplyAfterUserMs ?? "n/a"}ms / analysis=${sample.analysisMs ?? "n/a"}ms`,
      details: sample as unknown as Record<string, unknown>,
    });
    return NextResponse.json(result);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "Latency payload is invalid." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to persist latency sample.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

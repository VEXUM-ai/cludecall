import { NextResponse } from "next/server";
import { z } from "zod";

import { analyzeConversation, ElevenLabsApiError } from "@/lib/elevenlabs/api";

export const runtime = "nodejs";

const requestSchema = z.object({
  conversationId: z.string().min(1),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await analyzeConversation(body.conversationId);
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

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

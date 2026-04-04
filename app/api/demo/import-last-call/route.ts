import { NextResponse } from "next/server";
import { z } from "zod";

import { ElevenLabsApiError, importLatestPhoneCall } from "@/lib/elevenlabs/api";

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
    const run = await importLatestPhoneCall(body?.conversationId);
    return NextResponse.json(run);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: "conversationId must be a non-empty string when provided." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to import the latest phone call.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

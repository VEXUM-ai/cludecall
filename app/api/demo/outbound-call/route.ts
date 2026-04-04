import { NextResponse } from "next/server";
import { z } from "zod";

import { ElevenLabsApiError, startOutboundCall } from "@/lib/elevenlabs/api";

export const runtime = "nodejs";

const requestSchema = z.object({
  toNumber: z.string().min(3, "toNumber must be a non-empty phone number."),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const result = await startOutboundCall(body.toNumber);
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

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

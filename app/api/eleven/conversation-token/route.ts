import { NextResponse } from "next/server";

import { ElevenLabsApiError, getConversationToken } from "@/lib/elevenlabs/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const token = await getConversationToken();
    return NextResponse.json({ token });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get conversation token.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

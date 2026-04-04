import { NextResponse } from "next/server";

import { ElevenLabsApiError, getSignedUrl } from "@/lib/elevenlabs/api";

export const runtime = "nodejs";

export async function GET() {
  try {
    const signedUrl = await getSignedUrl();
    return NextResponse.json({ signedUrl });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to get signed URL.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

import { NextResponse } from "next/server";

import { listConversationHistorySummaries } from "@/lib/elevenlabs/api";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const rawLimit = url.searchParams.get("limit");
    const parsedLimit = rawLimit ? Number(rawLimit) : undefined;
    const limit =
      typeof parsedLimit === "number" && Number.isFinite(parsedLimit) && parsedLimit >= 1
        ? Math.min(20, Math.floor(parsedLimit))
        : 8;
    const summaries = await listConversationHistorySummaries(limit);
    return NextResponse.json({ items: summaries, count: summaries.length });
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to load conversation history.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

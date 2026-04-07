import { NextResponse } from "next/server";

import { reanalyzeConversationHistoryDetail } from "@/lib/elevenlabs/api";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    conversationId: string;
  }>;
};

export async function POST(_request: Request, context: RouteContext) {
  try {
    const { conversationId } = await context.params;
    const detail = await reanalyzeConversationHistoryDetail(conversationId);
    return NextResponse.json(detail);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to reanalyze conversation.";
    const status =
      typeof error === "object" &&
      error !== null &&
      "status" in error &&
      typeof (error as { status?: unknown }).status === "number"
        ? (error as { status: number }).status
        : 500;

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

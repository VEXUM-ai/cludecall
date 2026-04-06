import { NextResponse } from "next/server";
import { z } from "zod";

import { writeStoredAppointmentDraft } from "@/lib/appointment-store";
import { confirmAppointmentDraft } from "@/lib/appointments";
import {
  ElevenLabsApiError,
  getConversationHistoryDetail,
} from "@/lib/elevenlabs/api";

export const runtime = "nodejs";

const requestSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required."),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const detail = await getConversationHistoryDetail(body.conversationId);

    if (!detail.appointmentDraft) {
      return NextResponse.json(
        { error: "No appointment draft is available for this conversation." },
        { status: 409 }
      );
    }

    const draft = confirmAppointmentDraft(detail.appointmentDraft);
    const result = await writeStoredAppointmentDraft(draft);

    return NextResponse.json({
      appointmentDraft: result.draft,
      filePath: result.filePath,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "conversationId is required." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to confirm the appointment draft.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

import { NextResponse } from "next/server";
import { z } from "zod";

import { lookupLiveAvailability } from "@/lib/appointment-tool/live-availability";
import { isAuthorizedAppointmentToolWebhookRequest } from "@/lib/appointment-tool/live-tool-webhook";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

const requestSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required."),
  serviceLine: z.enum([
    "general_initial",
    "emergency_initial",
    "implant_consult",
    "thp_pretest",
    "free_screening",
    "whitening",
    "invisalign",
    "other_manual_review",
  ]),
  preferredDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "preferredDate must be YYYY-MM-DD."),
  preferredTimeRange: z.string().trim().min(1).nullable().optional(),
  isNewPatient: z.boolean().nullable().optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAuthorizedAppointmentToolWebhookRequest(request)) {
      await appendLiveMonitorEvent({
        kind: "error",
        channel: "phone",
        level: "warning",
        conversationId: null,
        message: "live appointment availability rejected: unauthorized request",
        details: null,
      });
      return NextResponse.json({ error: "Unauthorized live availability request." }, { status: 401 });
    }

    const body = requestSchema.parse(await request.json());
    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "phone",
      level: "info",
      conversationId: body.conversationId,
      message: "live appointment availability requested",
      details: {
        serviceLine: body.serviceLine,
        preferredDate: body.preferredDate,
      },
    });

    const result = await lookupLiveAvailability({
      conversationId: body.conversationId,
      serviceLine: body.serviceLine,
      preferredDate: body.preferredDate,
      preferredTimeRange: body.preferredTimeRange ?? null,
      isNewPatient: body.isNewPatient ?? null,
    });

    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "phone",
      level:
        result.status === "resolved"
          ? "success"
          : result.status === "manual_only"
            ? "warning"
            : "warning",
      conversationId: body.conversationId,
      message: "live appointment availability completed",
      details: {
        status: result.status,
        source: result.source,
        stale: result.stale,
        candidateCount: result.candidates.length,
        queueWaitMs: result.queueWaitMs,
        rpaReadMs: result.rpaReadMs,
      },
    });

    return NextResponse.json(result, {
      status:
        result.status === "resolved"
          ? 200
          : result.status === "pending_followup"
            ? 202
            : 409,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid live availability payload." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to resolve live appointment availability.";
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "phone",
      level: "error",
      conversationId: null,
      message: `live appointment availability failed: ${message}`,
      details: null,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

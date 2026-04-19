import { NextResponse } from "next/server";
import { z } from "zod";

import { confirmLiveHold } from "@/lib/appointment-tool/live-availability";
import { isAuthorizedAppointmentToolWebhookRequest } from "@/lib/appointment-tool/live-tool-webhook";
import { writeStoredAppointmentDraft } from "@/lib/appointment-store";
import { syncStoredAppointmentDraft } from "@/lib/demo-runs";
import { getConversationDetails } from "@/lib/elevenlabs/api";
import { normalizePhoneNumberForMemo } from "@/lib/elevenlabs/memo";
import { getServerConfig } from "@/lib/env";
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
  selectedTcStartTime: z.string().regex(/^\d{2}:\d{2}$/, "selectedTcStartTime must be HH:MM."),
  preferredTimeRange: z.string().trim().min(1).nullable().optional(),
  patientName: z.string().trim().min(1, "patientName is required."),
  phoneNumber: z.string().trim().min(1).nullable().optional(),
  isNewPatient: z.boolean().nullable().optional(),
  visitReason: z.string().trim().min(1).nullable().optional(),
});

export async function POST(request: Request) {
  try {
    if (!isAuthorizedAppointmentToolWebhookRequest(request)) {
      await appendLiveMonitorEvent({
        kind: "error",
        channel: "phone",
        level: "warning",
        conversationId: null,
        message: "live appointment hold confirm rejected: unauthorized request",
        details: null,
      });
      return NextResponse.json({ error: "Unauthorized live hold request." }, { status: 401 });
    }

    const body = requestSchema.parse(await request.json());
    let resolvedPhoneNumber = body.phoneNumber ?? null;
    if (!resolvedPhoneNumber) {
      try {
        const details = await getConversationDetails(body.conversationId);
        const metadata =
          details.metadata && typeof details.metadata === "object" ? details.metadata : {};
        const phoneCall =
          metadata &&
          typeof metadata === "object" &&
          "phone_call" in metadata &&
          typeof metadata.phone_call === "object" &&
          metadata.phone_call !== null
            ? (metadata.phone_call as Record<string, unknown>)
            : null;
        resolvedPhoneNumber = normalizePhoneNumberForMemo(phoneCall?.external_number);
      } catch {
        resolvedPhoneNumber = null;
      }
    }

    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "phone",
      level: "info",
      conversationId: body.conversationId,
      message: "live appointment hold confirm requested",
      details: {
        serviceLine: body.serviceLine,
        preferredDate: body.preferredDate,
        selectedTcStartTime: body.selectedTcStartTime,
      },
    });

    const result = await confirmLiveHold({
      conversationId: body.conversationId,
      serviceLine: body.serviceLine,
      preferredDate: body.preferredDate,
      selectedTcStartTime: body.selectedTcStartTime,
      preferredTimeRange: body.preferredTimeRange ?? null,
      patientName: body.patientName,
      phoneNumber: resolvedPhoneNumber,
      isNewPatient: body.isNewPatient ?? null,
      visitReason: body.visitReason ?? null,
    });

    if (result.execution?.draft) {
      await writeStoredAppointmentDraft(result.execution.draft);
      await syncStoredAppointmentDraft(result.execution.draft, getServerConfig().demoTimezone);
    }

    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "phone",
      level:
        result.status === "confirmed"
          ? "success"
          : result.status === "pending_finalize_post_call"
            ? "warning"
            : "warning",
      conversationId: body.conversationId,
      message: "live appointment hold confirm completed",
      details: {
        status: result.status,
        leaseId: result.leaseId,
        queueWaitMs: result.queueWaitMs,
        processingMs: result.processingMs,
        executionSuccess: result.execution?.success ?? null,
      },
    });

    return NextResponse.json(result, {
      status:
        result.status === "confirmed"
          ? 200
          : result.status === "pending_finalize_post_call"
            ? 202
            : 409,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid live hold payload." },
        { status: 400 }
      );
    }

    const message = error instanceof Error ? error.message : "Failed to confirm live appointment hold.";
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "phone",
      level: "error",
      conversationId: null,
      message: `live appointment hold confirm failed: ${message}`,
      details: null,
    });
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

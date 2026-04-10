import { NextResponse } from "next/server";
import { z } from "zod";

import { submitBookingWithProvider } from "@/lib/appointment-tool/provider";
import { writeStoredAppointmentDraft } from "@/lib/appointment-store";
import { syncStoredAppointmentDraft } from "@/lib/demo-runs";
import { getServerConfig } from "@/lib/env";
import {
  ElevenLabsApiError,
  getConversationHistoryDetail,
} from "@/lib/elevenlabs/api";
import {
  buildAppointmentFailureSlackNotification,
  buildAppointmentSuccessSlackNotification,
  sendSlackNotification,
} from "@/lib/notifications/slack";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

export const runtime = "nodejs";

const requestSchema = z.object({
  conversationId: z.string().min(1, "conversationId is required."),
  candidateId: z.string().min(1, "candidateId is required."),
});

export async function POST(request: Request) {
  try {
    const body = requestSchema.parse(await request.json());
    const config = getServerConfig();
    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: "system",
      level: "info",
      conversationId: body.conversationId,
      message: "appointment execution requested",
      details: {
        candidateId: body.candidateId,
      },
    });

    const detail = await getConversationHistoryDetail(body.conversationId);
    if (!detail.appointmentDraft) {
      return NextResponse.json(
        { error: "No appointment draft is available for this conversation." },
        { status: 409 }
      );
    }

    const result = await submitBookingWithProvider({
      draft: detail.appointmentDraft,
      selectedCandidateId: body.candidateId,
    });
    await writeStoredAppointmentDraft(result.draft);
    await syncStoredAppointmentDraft(result.draft, config.demoTimezone);

    const selectedCandidate =
      result.draft.availabilityCandidates.find((candidate) => candidate.id === body.candidateId) ??
      null;
    const slackNotification = result.success
      ? buildAppointmentSuccessSlackNotification({
          conversationId: body.conversationId,
          patientName: result.draft.patientName,
          phoneNumber: result.draft.phoneNumber,
          serviceLine: result.draft.serviceLine,
          triageLevel: result.draft.triageLevel,
          channelLabel: config.slackChannelLabel,
          auditId: result.auditRef?.auditId ?? null,
          candidateLabel: selectedCandidate?.label ?? null,
          bookingStatus: result.draft.bookingStatus,
          fields: [
            {
              label: "予約状態",
              value: result.draft.submissionState,
            },
            {
              label: "実行状態",
              value: result.draft.executionState,
            },
          ],
        })
      : buildAppointmentFailureSlackNotification({
          conversationId: body.conversationId,
          patientName: result.draft.patientName,
          phoneNumber: result.draft.phoneNumber,
          serviceLine: result.draft.serviceLine,
          triageLevel: result.draft.triageLevel,
          channelLabel: config.slackChannelLabel,
          auditId: result.auditRef?.auditId ?? null,
          candidateLabel: selectedCandidate?.label ?? null,
          bookingStatus: result.draft.bookingStatus,
          error: result.draft.executionError ?? result.message,
          fields: [
            {
              label: "予約状態",
              value: result.draft.submissionState,
            },
            {
              label: "実行状態",
              value: result.draft.executionState,
            },
            {
              label: "orphanRisk",
              value: result.orphanRisk ? "true" : "false",
            },
          ],
        });

    const slackDelivery = await sendSlackNotification(slackNotification);

    await appendLiveMonitorEvent({
      kind: "appointment",
      channel: detail.channel,
      level: result.success ? "success" : "error",
      conversationId: body.conversationId,
      message: result.success
        ? "appointment execution submitted"
        : "appointment execution failed",
      details: {
        candidateId: body.candidateId,
        orphanRisk: result.orphanRisk,
        executionState: result.draft.executionState,
        submissionState: result.draft.submissionState,
        executionError: result.draft.executionError,
        auditId: result.auditRef?.auditId ?? null,
        slackStatus: slackDelivery.status,
        slackReason: slackDelivery.reason,
      },
    });

    return NextResponse.json(result, { status: result.success ? 200 : 409 });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return NextResponse.json(
        { error: error.issues[0]?.message ?? "Invalid appointment execution payload." },
        { status: 400 }
      );
    }

    const message =
      error instanceof Error ? error.message : "Failed to execute appointment booking.";
    const status = error instanceof ElevenLabsApiError ? error.status : 500;
    await appendLiveMonitorEvent({
      kind: "error",
      channel: "system",
      level: "error",
      conversationId: null,
      message: `appointment execution failed: ${message}`,
      details: null,
    });

    return NextResponse.json(
      { error: message },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

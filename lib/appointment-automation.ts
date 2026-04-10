import {
  getAppointmentAutomationBlockReason,
  selectBestAvailabilityCandidate,
  updateAppointmentDraft,
} from "@/lib/appointments";
import { notifyAppointmentDraft } from "@/lib/appointment-notifications";
import {
  checkAvailabilityWithProvider,
  submitBookingWithProvider,
} from "@/lib/appointment-tool/provider";
import { writeStoredAppointmentDraft } from "@/lib/appointment-store";
import { syncStoredAppointmentDraft } from "@/lib/demo-runs";
import { getConversationHistoryDetail } from "@/lib/elevenlabs/api";
import { getServerConfig } from "@/lib/env";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";
import type { AppointmentDraft, ConversationHistoryDetail } from "@/lib/types";

async function persistDraft(draft: AppointmentDraft) {
  await writeStoredAppointmentDraft(draft);
  await syncStoredAppointmentDraft(draft, getServerConfig().demoTimezone);
}

async function refreshDetail(conversationId: string): Promise<ConversationHistoryDetail> {
  return getConversationHistoryDetail(conversationId);
}

function hasTerminalAutomationOutcome(draft: AppointmentDraft) {
  if (draft.submissionMode !== "direct_auto") {
    return true;
  }

  if (draft.submissionState === "submitted" && draft.notificationState === "sent") {
    return true;
  }

  return (
    draft.conversationOutcome !== "pending" &&
    draft.notificationState !== "not_sent"
  );
}

export async function runDirectAutoAppointmentFlow(conversationId: string) {
  const detail = await getConversationHistoryDetail(conversationId);
  const draft = detail.appointmentDraft;
  if (!draft) {
    return {
      detail,
      automated: false,
      reason: "No appointment draft is available.",
    };
  }

  if (draft.submissionMode !== "direct_auto") {
    return {
      detail,
      automated: false,
      reason: "APPOINTMENT_TOOL_MODE is not direct_auto.",
    };
  }

  if (draft.submissionState === "submitted" && draft.notificationState === "not_sent") {
    await notifyAppointmentDraft({
      draft,
      kind: "booking_submitted",
      message: "Apotool への自動投入が完了しました。",
    });
    return {
      detail: await refreshDetail(conversationId),
      automated: false,
      reason: "Recovered missing success notification.",
    };
  }

  if (
    draft.conversationOutcome === "live_handoff" &&
    draft.notificationState === "not_sent"
  ) {
    await notifyAppointmentDraft({
      draft,
      kind: "urgent_handoff_required",
      message: draft.executionError ?? draft.manualReviewReason ?? "急患のため人対応へ切り替えました。",
    });
    return {
      detail: await refreshDetail(conversationId),
      automated: false,
      reason: "Recovered missing urgent handoff notification.",
    };
  }

  if (
    draft.conversationOutcome === "requires_manual_followup" &&
    draft.notificationState === "not_sent"
  ) {
    await notifyAppointmentDraft({
      draft,
      kind: "manual_followup_required",
      message:
        draft.executionError ?? draft.manualReviewReason ?? "人手確認が必要な受付です。",
    });
    return {
      detail: await refreshDetail(conversationId),
      automated: false,
      reason: "Recovered missing manual follow-up notification.",
    };
  }

  if (draft.conversationOutcome === "failed" && draft.notificationState === "not_sent") {
    await notifyAppointmentDraft({
      draft,
      kind: "booking_failed",
      message: draft.executionError ?? "自動予約処理が失敗しました。",
    });
    return {
      detail: await refreshDetail(conversationId),
      automated: false,
      reason: "Recovered missing failure notification.",
    };
  }

  if (hasTerminalAutomationOutcome(draft)) {
    return {
      detail,
      automated: false,
      reason: "Automation already reached a terminal state.",
    };
  }

  await appendLiveMonitorEvent({
    kind: "appointment",
    channel: detail.channel,
    level: "info",
    conversationId,
    message: "direct_auto pipeline started",
    details: {
      serviceLine: draft.serviceLine,
      triageLevel: draft.triageLevel,
    },
  });

  const automationBlockReason = getAppointmentAutomationBlockReason({
    triageLevel: draft.triageLevel,
    menuMapping: draft.menuMapping,
  });

  if (automationBlockReason) {
    const blockedDraft = updateAppointmentDraft(draft, {
      submissionState: "needs_manual_entry",
      executionState: "manual_fallback",
      executionError: automationBlockReason,
      conversationOutcome:
        draft.triageLevel === "same_day_phone"
          ? "live_handoff"
          : "requires_manual_followup",
    });
    await persistDraft(blockedDraft);
    const kind =
      draft.triageLevel === "same_day_phone"
        ? "urgent_handoff_required"
        : "manual_followup_required";
    await notifyAppointmentDraft({
      draft: blockedDraft,
      kind,
      message: automationBlockReason,
    });
    return {
      detail: await refreshDetail(conversationId),
      automated: false,
      reason: automationBlockReason,
    };
  }

  const availability = await checkAvailabilityWithProvider(draft);
  await persistDraft(availability.draft);

  const selectedCandidate = selectBestAvailabilityCandidate(availability.draft);
  if (!selectedCandidate) {
    const noCandidateReason =
      availability.draft.executionError ??
      "希望条件に合う候補枠を自動選定できなかったため、人手確認が必要です。";
    const noCandidateDraft = updateAppointmentDraft(availability.draft, {
      submissionState: "needs_manual_entry",
      executionState: "manual_fallback",
      executionError: noCandidateReason,
      conversationOutcome: "requires_manual_followup",
    });
    await persistDraft(noCandidateDraft);
    await notifyAppointmentDraft({
      draft: noCandidateDraft,
      kind: "manual_followup_required",
      message: noCandidateReason,
    });
    return {
      detail: await refreshDetail(conversationId),
      automated: false,
      reason: noCandidateReason,
    };
  }

  const execution = await submitBookingWithProvider({
    draft: availability.draft,
    selectedCandidateId: selectedCandidate.id,
  });
  const nextDraft = updateAppointmentDraft(execution.draft, {
    conversationOutcome: execution.success ? "auto_booked" : "failed",
  });
  await persistDraft(nextDraft);

  await notifyAppointmentDraft({
    draft: nextDraft,
    kind: execution.success ? "booking_submitted" : "booking_failed",
    message: execution.message,
  });

  return {
    detail: await refreshDetail(conversationId),
    automated: execution.success,
    reason: execution.message,
  };
}

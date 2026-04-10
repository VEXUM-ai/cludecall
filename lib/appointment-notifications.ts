import { updateAppointmentDraft } from "@/lib/appointments";
import { writeStoredAppointmentDraft } from "@/lib/appointment-store";
import { syncStoredAppointmentDraft } from "@/lib/demo-runs";
import { getServerConfig } from "@/lib/env";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";
import {
  createAppointmentNotificationEventFromDraft,
  sendSlackAppointmentNotification,
} from "@/lib/notifications/slack";
import type { AppointmentDraft, AppointmentNotificationEventKind } from "@/lib/types";

async function persistDraft(draft: AppointmentDraft) {
  await writeStoredAppointmentDraft(draft);
  await syncStoredAppointmentDraft(draft, getServerConfig().demoTimezone);
}

export async function notifyAppointmentDraft(args: {
  draft: AppointmentDraft;
  kind: AppointmentNotificationEventKind;
  message: string;
}) {
  const event = createAppointmentNotificationEventFromDraft(args);
  const notification = await sendSlackAppointmentNotification(event);
  const nextDraft = updateAppointmentDraft(args.draft, {
    notificationChannel: notification.channel,
    notificationState: notification.state,
    notificationError: notification.error ?? notification.skippedReason,
    notifiedAt: notification.sentAt,
  });

  await persistDraft(nextDraft);
  await appendLiveMonitorEvent({
    kind: "appointment",
    channel: "system",
    level:
      notification.state === "sent"
        ? "success"
        : notification.state === "failed"
          ? "error"
          : "warning",
    conversationId: nextDraft.conversationId,
    message: `appointment notification ${notification.state}`,
    details: {
      kind: args.kind,
      error: notification.error,
      skippedReason: notification.skippedReason,
      notifiedAt: notification.sentAt,
    },
  });

  return {
    draft: nextDraft,
    notification,
  };
}

import { getServerConfig } from "@/lib/env";
import type {
  SlackNotificationDelivery,
  SlackNotificationPayload,
  SlackAppointmentFailureNotification,
  SlackAppointmentSuccessNotification,
  SlackUrgentTransferNotification,
} from "@/lib/types";

type SlackWebhookBody = {
  text: string;
};

function compact(value: string | null | undefined) {
  const trimmed = value?.trim() ?? "";
  return trimmed.length > 0 ? trimmed : "未取得";
}

function formatFieldLines(fields: SlackNotificationPayload["fields"]) {
  return fields
    .map((field) => `- ${field.label}: ${compact(field.value)}`)
    .join("\n");
}

function buildHeadline(notification: SlackNotificationPayload) {
  switch (notification.kind) {
    case "appointment_success":
      return "予約投入完了";
    case "appointment_failure":
      return "予約投入失敗";
    case "urgent_transfer":
      return "急患を人へ転送";
  }
}

function buildCoreLines(notification: SlackNotificationPayload) {
  const lines = [
    `*${buildHeadline(notification)}*`,
    `- conversation: ${notification.conversationId}`,
    `- 患者名: ${compact(notification.patientName)}`,
    `- 電話番号: ${compact(notification.phoneNumber)}`,
    `- 受付区分: ${notification.serviceLine}`,
    `- 優先度: ${notification.triageLevel}`,
    `- audit: ${compact(notification.auditId)}`,
    `- 通知先: ${compact(notification.channelLabel)}`,
  ];

  if (notification.kind === "appointment_success") {
    lines.push(`- 予約枠: ${compact(notification.candidateLabel)}`);
    lines.push(`- 受付状態: ${compact(notification.bookingStatus)}`);
  }

  if (notification.kind === "appointment_failure") {
    lines.push(`- 予約枠: ${compact(notification.candidateLabel)}`);
    lines.push(`- 受付状態: ${compact(notification.bookingStatus)}`);
    lines.push(`- エラー: ${compact(notification.error)}`);
  }

  if (notification.kind === "urgent_transfer") {
    lines.push(`- 転送先: ${notification.transferTargetLabel}`);
    lines.push(`- 転送番号: ${notification.transferTargetPhone}`);
    lines.push(`- 引き継ぎ: ${compact(notification.handoffSummary)}`);
  }

  lines.push(notification.occurredAt ? `- 発生時刻: ${notification.occurredAt}` : "");
  lines.push(formatFieldLines(notification.fields));

  return lines.filter((line) => line.length > 0).join("\n");
}

export function buildSlackWebhookBody(
  notification: SlackNotificationPayload
): SlackWebhookBody {
  return {
    text: buildCoreLines(notification),
  };
}

export function buildAppointmentSuccessSlackNotification(args: {
  conversationId: string;
  patientName: string | null;
  phoneNumber: string | null;
  serviceLine: SlackAppointmentSuccessNotification["serviceLine"];
  triageLevel: SlackAppointmentSuccessNotification["triageLevel"];
  channelLabel: string | null;
  auditId: string | null;
  candidateLabel: string | null;
  bookingStatus: string;
  occurredAt?: string;
  fields?: SlackAppointmentSuccessNotification["fields"];
}): SlackAppointmentSuccessNotification {
  return {
    kind: "appointment_success",
    conversationId: args.conversationId,
    patientName: args.patientName,
    phoneNumber: args.phoneNumber,
    serviceLine: args.serviceLine,
    triageLevel: args.triageLevel,
    channelLabel: args.channelLabel,
    auditId: args.auditId,
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    fields: args.fields ?? [],
    candidateLabel: args.candidateLabel,
    bookingStatus: args.bookingStatus,
  };
}

export function buildAppointmentFailureSlackNotification(args: {
  conversationId: string;
  patientName: string | null;
  phoneNumber: string | null;
  serviceLine: SlackAppointmentFailureNotification["serviceLine"];
  triageLevel: SlackAppointmentFailureNotification["triageLevel"];
  channelLabel: string | null;
  auditId: string | null;
  candidateLabel: string | null;
  bookingStatus: string;
  error: string;
  occurredAt?: string;
  fields?: SlackAppointmentFailureNotification["fields"];
}): SlackAppointmentFailureNotification {
  return {
    kind: "appointment_failure",
    conversationId: args.conversationId,
    patientName: args.patientName,
    phoneNumber: args.phoneNumber,
    serviceLine: args.serviceLine,
    triageLevel: args.triageLevel,
    channelLabel: args.channelLabel,
    auditId: args.auditId,
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    fields: args.fields ?? [],
    candidateLabel: args.candidateLabel,
    bookingStatus: args.bookingStatus,
    error: args.error,
  };
}

export function buildUrgentTransferSlackNotification(args: {
  conversationId: string;
  patientName: string | null;
  phoneNumber: string | null;
  serviceLine: SlackUrgentTransferNotification["serviceLine"];
  triageLevel: SlackUrgentTransferNotification["triageLevel"];
  channelLabel: string | null;
  auditId: string | null;
  transferTargetLabel: string;
  transferTargetPhone: string;
  handoffSummary: string;
  occurredAt?: string;
  fields?: SlackUrgentTransferNotification["fields"];
}): SlackUrgentTransferNotification {
  return {
    kind: "urgent_transfer",
    conversationId: args.conversationId,
    patientName: args.patientName,
    phoneNumber: args.phoneNumber,
    serviceLine: args.serviceLine,
    triageLevel: args.triageLevel,
    channelLabel: args.channelLabel,
    auditId: args.auditId,
    occurredAt: args.occurredAt ?? new Date().toISOString(),
    fields: args.fields ?? [],
    transferTargetLabel: args.transferTargetLabel,
    transferTargetPhone: args.transferTargetPhone,
    handoffSummary: args.handoffSummary,
  };
}

export async function sendSlackNotification(
  notification: SlackNotificationPayload
): Promise<SlackNotificationDelivery> {
  const config = getServerConfig();
  if (!config.slackWebhookUrl) {
    return {
      status: "skipped",
      reason: "SLACK_WEBHOOK_URL is not configured.",
    };
  }

  const body = buildSlackWebhookBody(notification);
  try {
    const response = await fetch(config.slackWebhookUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json; charset=utf-8",
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      return {
        status: "failed",
        reason: `Slack webhook returned ${response.status}.`,
      };
    }
  } catch (error) {
    return {
      status: "failed",
      reason: error instanceof Error ? error.message : "Slack webhook request failed.",
    };
  }

  return {
    status: "sent",
    reason: null,
  };
}

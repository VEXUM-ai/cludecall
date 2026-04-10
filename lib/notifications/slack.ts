import { request as httpsRequest } from "node:https";

import {
  buildExecutionCandidatePreview,
  SERVICE_LINE_LABELS,
  TRIAGE_LEVEL_LABELS,
} from "@/lib/appointments";
import { getServerConfig } from "@/lib/env";
import type {
  AppointmentDraft,
  AppointmentNotificationEvent,
  AppointmentNotificationEventKind,
  AppointmentNotificationResult,
} from "@/lib/types";

function buildNotificationTitle(kind: AppointmentNotificationEventKind) {
  switch (kind) {
    case "booking_submitted":
      return "予約自動投入完了";
    case "booking_failed":
      return "予約自動投入失敗";
    case "manual_followup_required":
      return "要確認";
    case "urgent_handoff_required":
      return "急患 live 転送対象";
    default:
      return "受付通知";
  }
}

function buildSlackText(event: AppointmentNotificationEvent) {
  const config = getServerConfig();
  const lines = [
    `*${buildNotificationTitle(event.kind)}*`,
    config.slackChannelLabel ? `通知先: ${config.slackChannelLabel}` : null,
    `患者名: ${event.patientName ?? "未取得"}`,
    `電話番号: ${event.phoneNumber ?? "未取得"}`,
    `受付区分: ${SERVICE_LINE_LABELS[event.serviceLine]}`,
    `優先度: ${TRIAGE_LEVEL_LABELS[event.triageLevel]}`,
    event.selectedCandidateLabel ? `予約枠: ${event.selectedCandidateLabel}` : null,
    `内容: ${event.message}`,
    `conversation_id: ${event.conversationId}`,
    event.auditRef?.logPath ? `audit_log: ${event.auditRef.logPath}` : null,
  ].filter((line): line is string => Boolean(line));

  return lines.join("\n");
}

function postJson(url: URL, body: Record<string, unknown>) {
  return new Promise<void>((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
      },
      (response) => {
        let rawBody = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(
              new Error(
                rawBody || `Slack webhook request failed with ${response.statusCode ?? 500}.`
              )
            );
            return;
          }

          resolve();
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });
    request.write(JSON.stringify(body));
    request.end();
  });
}

export function createAppointmentNotificationEventFromDraft(args: {
  draft: AppointmentDraft;
  kind: AppointmentNotificationEventKind;
  message: string;
}): AppointmentNotificationEvent {
  const selectedCandidate =
    args.draft.availabilityCandidates.find(
      (candidate) => candidate.id === args.draft.selectedCandidateId
    ) ?? null;

  return {
    kind: args.kind,
    conversationId: args.draft.conversationId,
    clinicName: args.draft.clinicName,
    patientName: args.draft.patientName,
    phoneNumber: args.draft.phoneNumber,
    serviceLine: args.draft.serviceLine,
    triageLevel: args.draft.triageLevel,
    message: args.message,
    selectedCandidateLabel: selectedCandidate
      ? buildExecutionCandidatePreview(selectedCandidate)
      : null,
    auditRef: args.draft.auditRef,
  };
}

export async function sendSlackAppointmentNotification(
  event: AppointmentNotificationEvent
): Promise<AppointmentNotificationResult> {
  const config = getServerConfig();
  if (!config.slackWebhookUrl) {
    return {
      channel: "slack",
      state: "skipped",
      sentAt: null,
      error: null,
      skippedReason: "SLACK_WEBHOOK_URL is not configured.",
    };
  }

  try {
    await postJson(new URL(config.slackWebhookUrl), {
      text: buildSlackText(event),
      unfurl_links: false,
      unfurl_media: false,
    });
    return {
      channel: "slack",
      state: "sent",
      sentAt: new Date().toISOString(),
      error: null,
      skippedReason: null,
    };
  } catch (error) {
    return {
      channel: "slack",
      state: "failed",
      sentAt: null,
      error: error instanceof Error ? error.message : "Slack notification failed.",
      skippedReason: null,
    };
  }
}

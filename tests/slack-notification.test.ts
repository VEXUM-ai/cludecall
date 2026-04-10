import test from "node:test";
import assert from "node:assert/strict";

process.env.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "test-api-key";
process.env.ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? "test-agent-id";

import { buildAppointmentDraft, createAvailabilityCandidate } from "@/lib/appointments";
import { normalizeReservationMemo } from "@/lib/elevenlabs/memo";
import {
  createAppointmentNotificationEventFromDraft,
  sendSlackAppointmentNotification,
} from "@/lib/notifications/slack";

function createDraft() {
  const candidate = createAvailabilityCandidate({
    date: "2026-04-22",
    tcStartTime: "10:00",
    tcUnit: "カウンセリング",
    treatmentUnit: "①治療",
  });

  return {
    ...buildAppointmentDraft({
      conversationId: "conv_test_slack",
      memo: normalizeReservationMemo({
        patient_name: "山田 花子",
        patient_name_yomi: "やまだ はなこ",
        phone_number: "090-1234-5678",
        is_new_patient: true,
        visit_reason: "初診の相談",
        preferred_date_1: "2026-04-22",
        preferred_time_range_1: "午前",
      }),
      transcript: [],
      channel: "phone",
      anchorAt: "2026-04-10T00:00:00.000Z",
    }),
    availabilityCandidates: [candidate],
    selectedCandidateId: candidate.id,
    auditRef: {
      auditId: "audit-1",
      logPath: "artifacts/demo.log",
      screenshotPaths: [],
      lastAction: "execute" as const,
      updatedAt: "2026-04-10T00:00:00.000Z",
    },
  };
}

test("creates a booking success notification event from a draft", () => {
  const event = createAppointmentNotificationEventFromDraft({
    draft: createDraft(),
    kind: "booking_submitted",
    message: "Apotool への投入が完了しました。",
  });

  assert.equal(event.kind, "booking_submitted");
  assert.equal(event.patientName, "山田 花子");
  assert.equal(event.selectedCandidateLabel, "2026-04-22 10:00 / カウンセリング -> ①治療");
  assert.equal(event.auditRef?.auditId, "audit-1");
});

test("skips gracefully when slack webhook url is missing", async () => {
  const originalBotToken = process.env.SLACK_BOT_TOKEN;
  const originalChannelId = process.env.SLACK_CHANNEL_ID;
  const originalWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_BOT_TOKEN;
  delete process.env.SLACK_CHANNEL_ID;
  delete process.env.SLACK_WEBHOOK_URL;

  const result = await sendSlackAppointmentNotification(
    createAppointmentNotificationEventFromDraft({
      draft: createDraft(),
      kind: "booking_failed",
      message: "Apotool login failed",
    })
  );

  if (originalBotToken === undefined) {
    delete process.env.SLACK_BOT_TOKEN;
  } else {
    process.env.SLACK_BOT_TOKEN = originalBotToken;
  }

  if (originalChannelId === undefined) {
    delete process.env.SLACK_CHANNEL_ID;
  } else {
    process.env.SLACK_CHANNEL_ID = originalChannelId;
  }

  if (originalWebhookUrl === undefined) {
    delete process.env.SLACK_WEBHOOK_URL;
  } else {
    process.env.SLACK_WEBHOOK_URL = originalWebhookUrl;
  }

  assert.equal(result.state, "skipped");
  assert.match(result.skippedReason ?? "", /SLACK_BOT_TOKEN|SLACK_WEBHOOK_URL/);
});

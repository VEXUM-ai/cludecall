import test from "node:test";
import assert from "node:assert/strict";

process.env.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "test-api-key";
process.env.ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? "test-agent-id";

import {
  buildAppointmentFailureSlackNotification,
  buildAppointmentSuccessSlackNotification,
  buildSlackWebhookBody,
  buildUrgentTransferSlackNotification,
  sendSlackNotification,
} from "@/lib/notifications/slack";

function withFetchMock<T>(mock: typeof fetch, run: () => Promise<T>) {
  const originalFetch = globalThis.fetch;
  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = mock;
  return run().finally(() => {
    (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch;
  });
}

test("builds a slack webhook payload for appointment success", () => {
  const notification = buildAppointmentSuccessSlackNotification({
    conversationId: "conv_1",
    patientName: "山田 花子",
    phoneNumber: "090-1234-5678",
    serviceLine: "general_initial",
    triageLevel: "routine",
    channelLabel: "clinic-ops",
    auditId: "audit-1",
    candidateLabel: "2026-04-22 10:00 TC30 / 治療60",
    bookingStatus: "submitted",
    fields: [{ label: "予約結果", value: "成功" }],
    occurredAt: "2026-04-10T00:00:00.000Z",
  });

  const body = buildSlackWebhookBody(notification);

  assert.match(body.text, /予約投入完了/);
  assert.match(body.text, /conversation: conv_1/);
  assert.match(body.text, /患者名: 山田 花子/);
  assert.match(body.text, /予約枠: 2026-04-22 10:00 TC30 \/ 治療60/);
  assert.match(body.text, /予約結果: 成功/);
});

test("builds a slack webhook payload for appointment failure", () => {
  const notification = buildAppointmentFailureSlackNotification({
    conversationId: "conv_2",
    patientName: "山田 花子",
    phoneNumber: "090-1234-5678",
    serviceLine: "general_initial",
    triageLevel: "routine",
    channelLabel: "clinic-ops",
    auditId: "audit-2",
    candidateLabel: "2026-04-22 10:00 TC30 / 治療60",
    bookingStatus: "submission_failed",
    error: "Apotool login failed",
    fields: [],
    occurredAt: "2026-04-10T00:00:00.000Z",
  });

  const body = buildSlackWebhookBody(notification);

  assert.match(body.text, /予約投入失敗/);
  assert.match(body.text, /エラー: Apotool login failed/);
});

test("builds a slack webhook payload for urgent transfer", () => {
  const notification = buildUrgentTransferSlackNotification({
    conversationId: "conv_3",
    patientName: "山田 花子",
    phoneNumber: "090-1234-5678",
    serviceLine: "emergency_initial",
    triageLevel: "same_day_phone",
    channelLabel: "clinic-ops",
    auditId: "audit-3",
    transferTargetLabel: "受付代表番号",
    transferTargetPhone: "06-0000-0000",
    handoffSummary: "強い痛みのため人へ引き継ぎ",
    fields: [],
    occurredAt: "2026-04-10T00:00:00.000Z",
  });

  const body = buildSlackWebhookBody(notification);

  assert.match(body.text, /急患を人へ転送/);
  assert.match(body.text, /転送先: 受付代表番号/);
  assert.match(body.text, /引き継ぎ: 強い痛みのため人へ引き継ぎ/);
});

test("sendSlackNotification skips gracefully when webhook url is missing", async () => {
  const originalWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  delete process.env.SLACK_WEBHOOK_URL;

  let called = false;
  const result = await withFetchMock(async () => {
    called = true;
    throw new Error("fetch should not be called");
  }, async () =>
    sendSlackNotification(
      buildAppointmentSuccessSlackNotification({
        conversationId: "conv_4",
        patientName: "山田 花子",
        phoneNumber: "090-1234-5678",
        serviceLine: "general_initial",
        triageLevel: "routine",
        channelLabel: null,
        auditId: null,
        candidateLabel: null,
        bookingStatus: "submitted",
        fields: [],
      })
    )
  );

  if (originalWebhookUrl === undefined) {
    delete process.env.SLACK_WEBHOOK_URL;
  } else {
    process.env.SLACK_WEBHOOK_URL = originalWebhookUrl;
  }

  assert.equal(called, false);
  assert.equal(result.status, "skipped");
});

test("sendSlackNotification posts to webhook when configured", async () => {
  const originalWebhookUrl = process.env.SLACK_WEBHOOK_URL;
  process.env.SLACK_WEBHOOK_URL = "https://example.com/webhook";

  let calledUrl: string | null = null;
  let calledBody: string | null = null;
  const result = await withFetchMock(async (input, init) => {
    calledUrl = String(input);
    calledBody = typeof init?.body === "string" ? init.body : null;
    return new Response("", { status: 200 });
  }, async () =>
    sendSlackNotification(
      buildAppointmentSuccessSlackNotification({
        conversationId: "conv_5",
        patientName: "山田 花子",
        phoneNumber: "090-1234-5678",
        serviceLine: "general_initial",
        triageLevel: "routine",
        channelLabel: "clinic-ops",
        auditId: "audit-5",
        candidateLabel: "2026-04-22 10:00 TC30 / 治療60",
        bookingStatus: "submitted",
        fields: [],
        occurredAt: "2026-04-10T00:00:00.000Z",
      })
    )
  );

  if (originalWebhookUrl === undefined) {
    delete process.env.SLACK_WEBHOOK_URL;
  } else {
    process.env.SLACK_WEBHOOK_URL = originalWebhookUrl;
  }

  assert.equal(result.status, "sent");
  assert.equal(calledUrl, "https://example.com/webhook");
  assert.ok(calledBody);
  assert.match(calledBody ?? "", /予約投入完了/);
});

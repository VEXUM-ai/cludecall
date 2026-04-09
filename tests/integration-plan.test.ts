import test from "node:test";
import assert from "node:assert/strict";

process.env.ELEVENLABS_API_KEY = process.env.ELEVENLABS_API_KEY ?? "test-api-key";
process.env.ELEVENLABS_AGENT_ID = process.env.ELEVENLABS_AGENT_ID ?? "test-agent-id";
process.env.APPOINTMENT_TOOL_PROVIDER =
  process.env.APPOINTMENT_TOOL_PROVIDER ?? "apotool_rpa";
process.env.APPOINTMENT_TOOL_MODE = process.env.APPOINTMENT_TOOL_MODE ?? "manual_review";

import { EMIHA_KNOWLEDGE_PACK } from "@/lib/clinic-config/emiha";
import {
  applyAvailabilityResults,
  buildAppointmentDraft,
  confirmAppointmentDraft,
  createAvailabilityCandidate,
  findServiceMenuMapping,
  getAppointmentAutomationBlockReason,
  markAppointmentExecutionSubmitted,
} from "@/lib/appointments";
import { evaluateAppointmentExecutionGuard } from "@/lib/appointment-tool/provider";
import { normalizeReservationMemo } from "@/lib/elevenlabs/memo";

test("knowledge pack keeps approved patient facts separate from legacy override", () => {
  const businessHoursFact = EMIHA_KNOWLEDGE_PACK.approvedFacts.find(
    (fact) => fact.field === "businessHours"
  );
  const legacyOverride = EMIHA_KNOWLEDGE_PACK.operationalOverrides.find(
    (override) => override.field === "businessHours"
  );

  assert.ok(businessHoursFact);
  assert.equal(businessHoursFact.value, EMIHA_KNOWLEDGE_PACK.publicProfile.businessHours);
  assert.ok(legacyOverride);
  assert.notEqual(legacyOverride.internalValue, businessHoursFact.value);
  assert.equal(legacyOverride.patientFacingValue, businessHoursFact.value);
});

test("legacy Retell-style fields normalize into the unified reservation memo and draft", () => {
  const memo = normalizeReservationMemo({
    patient_name: "山田 花子",
    patient_name_yomi: "やまだ はなこ",
    phone_number: "090-1234-5678",
    is_new_patient: true,
    symptom: "右下の奥歯が強い痛みで腫れている",
    urgency_level: "緊急",
    preferred_datetime: "来週月曜日の午前",
  });

  const draft = buildAppointmentDraft({
    conversationId: "conv_test_001",
    memo,
    transcript: [],
    channel: "phone",
    anchorAt: "2026-04-09T10:00:00.000Z",
  });

  assert.equal(memo.visit_reason, "右下の奥歯が強い痛みで腫れている");
  assert.equal(memo.symptom_summary, "右下の奥歯が強い痛みで腫れている");
  assert.equal(memo.triage_level, "same_day_phone");
  assert.equal(draft.serviceLine, "emergency_initial");
  assert.equal(draft.triageLevel, "same_day_phone");
  assert.equal(
    getAppointmentAutomationBlockReason({
      triageLevel: draft.triageLevel,
      menuMapping: draft.menuMapping,
    }),
    "急患や当日優先の問い合わせは v1 の自動候補枠確認・自動投入の対象外です。スタッフ折り返しで対応します。"
  );
  assert.equal(draft.knowledgeVersion, EMIHA_KNOWLEDGE_PACK.version);
  assert.ok(draft.preferredSlots.length >= 1);
});

test("draft review and execution metadata stay synchronized with menu mappings", () => {
  const draft = buildAppointmentDraft({
    conversationId: "conv_test_002",
    memo: normalizeReservationMemo({
      patient_name: "山田 花子",
      patient_name_yomi: "やまだ はなこ",
      phone_number: "090-1234-5678",
      is_new_patient: true,
      visit_reason: "初診の相談",
      preferred_date_1: "2026-04-16",
      preferred_time_range_1: "午前",
    }),
    transcript: [],
    channel: "web",
    anchorAt: "2026-04-09T10:00:00.000Z",
  });

  const reviewedDraft = confirmAppointmentDraft(draft, "reviewer-a");
  const candidate = createAvailabilityCandidate({
    date: "2026-04-16",
    tcStartTime: "10:00",
    tcUnit: "カウンセリング",
    treatmentUnit: "①治療",
  });
  const availabilityDraft = applyAvailabilityResults(reviewedDraft, [candidate], null);
  const submittedDraft = markAppointmentExecutionSubmitted(
    availabilityDraft,
    candidate.id,
    null
  );

  assert.equal(findServiceMenuMapping("general_initial")?.automationPolicy, "rpa_supported");
  assert.equal(findServiceMenuMapping("emergency_initial")?.automationPolicy, "manual_review_only");
  assert.equal(findServiceMenuMapping("implant_consult")?.automationPolicy, "manual_review_only");
  assert.equal(
    getAppointmentAutomationBlockReason({
      triageLevel: reviewedDraft.triageLevel,
      menuMapping: reviewedDraft.menuMapping,
    }),
    null
  );
  assert.equal(reviewedDraft.reviewedBy, "reviewer-a");
  assert.equal(reviewedDraft.submissionState, "confirmed_pending_submission");
  assert.equal(availabilityDraft.availabilityCandidates[0]?.id, candidate.id);
  assert.equal(
    availabilityDraft.appointmentToolPayload.execution.availabilityCandidates[0]?.id,
    candidate.id
  );
  assert.equal(submittedDraft.executionState, "submitted");
  assert.equal(submittedDraft.submissionState, "submitted");
  assert.equal(submittedDraft.appointmentToolPayload.execution.selectedCandidateId, candidate.id);
});

test("test-only execution policy blocks live-style bookings and allows explicit test bookings", () => {
  process.env.APPOINTMENT_EXECUTION_POLICY = "test_only";
  process.env.APPOINTMENT_TEST_PATIENT_PATTERNS = "予約,テスト";
  process.env.APPOINTMENT_TEST_MIN_LEAD_DAYS = "30";

  const draft = buildAppointmentDraft({
    conversationId: "conv_test_003",
    memo: normalizeReservationMemo({
      patient_name: "山田 花子",
      patient_name_yomi: "やまだ はなこ",
      phone_number: "090-1234-5678",
      is_new_patient: true,
      visit_reason: "初診の相談",
      preferred_date_1: "2099-06-20",
      preferred_time_range_1: "午前",
    }),
    transcript: [],
    channel: "web",
    anchorAt: "2026-04-09T10:00:00.000Z",
  });
  const futureCandidate = createAvailabilityCandidate({
    date: "2099-06-20",
    tcStartTime: "10:00",
    tcUnit: "カウンセリング",
    treatmentUnit: "①治療",
  });

  const blockedByName = evaluateAppointmentExecutionGuard({
    draft,
    candidate: futureCandidate,
  });
  assert.match(blockedByName ?? "", /test_only/);

  const blockedByDate = evaluateAppointmentExecutionGuard({
    draft: {
      ...draft,
      patientName: "予約太郎",
      patientNameYomi: "よやくたろう",
    },
    candidate: {
      ...futureCandidate,
      date: "2000-01-01",
    },
  });
  assert.match(blockedByDate ?? "", /予約日は/);

  const allowed = evaluateAppointmentExecutionGuard({
    draft: {
      ...draft,
      patientName: "予約太郎",
      patientNameYomi: "よやくたろう",
    },
    candidate: futureCandidate,
  });
  assert.equal(allowed, null);
});

test("non-routine triage stays manual-review only after review", () => {
  const draft = confirmAppointmentDraft(
    buildAppointmentDraft({
      conversationId: "conv_test_004",
      memo: normalizeReservationMemo({
        patient_name: "急患 花子",
        patient_name_yomi: "きゅうかん はなこ",
        phone_number: "090-1234-5678",
        is_new_patient: true,
        symptom: "急患で強い痛みがあり夜眠れない",
        urgency_level: "急患",
      }),
      transcript: [],
      channel: "phone",
      anchorAt: "2026-04-09T10:00:00.000Z",
    }),
    "reviewer-b"
  );

  assert.equal(draft.serviceLine, "emergency_initial");
  assert.equal(draft.triageLevel, "same_day_phone");
  assert.match(draft.manualReviewReason ?? "", /自動候補枠確認・自動投入の対象外/);
  assert.match(
    getAppointmentAutomationBlockReason({
      triageLevel: draft.triageLevel,
      menuMapping: draft.menuMapping,
    }) ?? "",
    /自動候補枠確認・自動投入の対象外/
  );
});

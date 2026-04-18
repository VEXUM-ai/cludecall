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
  selectBestAvailabilityCandidate,
} from "@/lib/appointments";
import { normalizeReservationMemo } from "@/lib/elevenlabs/memo";
import {
  isPhoneConversationDoneStatus,
  shouldStartPhonePostCallFallback,
} from "@/lib/phone-postcall-fallback";

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
    patient_name: "山田 太郎",
    patient_name_yomi: "やまだ たろう",
    phone_number: "090-1234-5678",
    is_new_patient: true,
    symptom: "急患で強い痛みがある",
    urgency_level: "same_day_phone",
    preferred_datetime: "明日の午前",
    scheduled_datetime: "2026-04-10 10:00",
    appointment_completed: true,
  });

  const draft = buildAppointmentDraft({
    conversationId: "conv_test_001",
    memo,
    transcript: [],
    channel: "phone",
    anchorAt: "2026-04-09T10:00:00.000Z",
  });

  assert.equal(memo.visit_reason, "急患で強い痛みがある");
  assert.equal(memo.symptom_summary, "急患で強い痛みがある");
  assert.equal(memo.triage_level, "same_day_phone");
  assert.equal(memo.scheduled_datetime, "2026-04-10 10:00");
  assert.equal(memo.appointment_completed, true);
  assert.equal(draft.serviceLine, "emergency_initial");
  assert.equal(draft.triageLevel, "same_day_phone");
  assert.equal(draft.scheduledDatetime, "2026-04-10 10:00");
  assert.equal(draft.appointmentCompleted, true);
  assert.equal(draft.bookingStatus, "transferred");
  assert.equal(
    getAppointmentAutomationBlockReason({
      triageLevel: draft.triageLevel,
      menuMapping: draft.menuMapping,
    }),
    "急患や当日優先の問い合わせは Apotool 自動投入の対象外です。通話中にスタッフへ電話転送する前提です。"
  );
  assert.equal(draft.knowledgeVersion, EMIHA_KNOWLEDGE_PACK.version);
  assert.ok(draft.preferredSlots.length >= 1);
  assert.equal(draft.handoffState, "requires_live_handoff");
});

test("draft review and execution metadata stay synchronized with menu mappings", () => {
  const draft = buildAppointmentDraft({
    conversationId: "conv_test_002",
    memo: normalizeReservationMemo({
      patient_name: "山田 花子",
      patient_name_yomi: "やまだ はなこ",
      phone_number: "090-1234-5678",
      is_new_patient: true,
      visit_reason: "初診の予約をしたい",
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
    treatmentUnit: "診療ユニットA",
  });
  const availabilityDraft = applyAvailabilityResults(reviewedDraft, [candidate], null);
  const submittedDraft = markAppointmentExecutionSubmitted(
    availabilityDraft,
    candidate.id,
    null
  );

  assert.equal(findServiceMenuMapping("general_initial")?.automationPolicy, "rpa_supported");
  assert.equal(findServiceMenuMapping("general_initial")?.apotoolTcMenu, "T/S (30分)");
  assert.equal(findServiceMenuMapping("emergency_initial")?.automationPolicy, "manual_review_only");
  assert.equal(findServiceMenuMapping("emergency_initial")?.apotoolTcMenu, "T/S (30分)");
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
  assert.equal(submittedDraft.scheduledDatetime, "2026-04-16 10:00");
  assert.equal(submittedDraft.appointmentCompleted, true);
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
        symptom: "急患で強い痛みがあり今すぐ診てほしい",
        urgency_level: "same_day_phone",
      }),
      transcript: [],
      channel: "phone",
      anchorAt: "2026-04-09T10:00:00.000Z",
    }),
    "reviewer-b"
  );

  assert.equal(draft.serviceLine, "emergency_initial");
  assert.equal(draft.triageLevel, "same_day_phone");
  assert.match(draft.manualReviewReason ?? "", /自動投入の対象外/);
  assert.match(
    getAppointmentAutomationBlockReason({
      triageLevel: draft.triageLevel,
      menuMapping: draft.menuMapping,
    }) ?? "",
    /自動投入の対象外/
  );
});

test("phone post-call fallback activates when realtime monitoring does not start", () => {
  assert.equal(
    shouldStartPhonePostCallFallback({
      monitorStarted: true,
      reason: null,
    }),
    false
  );
  assert.equal(
    shouldStartPhonePostCallFallback({
      monitorStarted: false,
      reason: "remote_monitoring_disabled",
    }),
    true
  );
  assert.equal(isPhoneConversationDoneStatus("done"), true);
  assert.equal(isPhoneConversationDoneStatus("in-progress"), false);
  assert.equal(isPhoneConversationDoneStatus("initiated"), false);
});

test("routine booking is not downgraded by noisy analysis fields or generic same-day wording", () => {
  const draft = buildAppointmentDraft({
    conversationId: "conv_test_005",
    memo: normalizeReservationMemo({
      patient_name: "デモヤマダ",
      patient_name_yomi: "でもやまだ",
      phone_number: "09000000000",
      is_new_patient: true,
      visit_reason: "右上の歯がしみるので初診予約とクリーニング相談をしたい",
      symptom_summary: "右上の歯がしみる",
      urgency_reason: "クリーニングも相談したい",
      preferred_date_1: "2026-10-20",
      preferred_time_range_1: "午前",
      preferred_date_2: "2026年10月22日の午後",
      preferred_time_range_2: "午後",
      callback_ok: true,
      notes_for_staff: "通常受付デモ",
      booking_status: "manual_follow_up",
      service_line: "general_initial",
      triage_level: "doctor_required",
      line_form_status: "not_using_line",
      manual_review_reason: "通話品質の問題",
    }),
    transcript: [
      {
        id: "t1",
        role: "agent",
        text: "初診でLINE問診が未回答の場合は15分前にお越しください。",
        tentative: false,
        timeInCallSecs: 10,
      },
      {
        id: "t2",
        role: "user",
        text: "LINEはまだやっていません。",
        tentative: false,
        timeInCallSecs: 12,
      },
      {
        id: "t3",
        role: "agent",
        text: "当日は15分前にお願いします。",
        tentative: false,
        timeInCallSecs: 15,
      },
    ],
    channel: "phone",
    anchorAt: "2026-04-11T00:45:32.000Z",
  });

  assert.equal(draft.serviceLine, "general_initial");
  assert.equal(draft.triageLevel, "routine");
  assert.equal(draft.lineFormStatus, "needs_arrival_form");
  assert.equal(draft.bookingStatus, "pending_auto_booking");
  assert.ok(
    draft.followUpChecklist.includes("LINE問診が未回答なら15分前来院をご案内")
  );
});

test("service-specific follow-up checklist includes free screening and halitosis rules", () => {
  const screeningDraft = buildAppointmentDraft({
    conversationId: "conv_test_005a",
    memo: normalizeReservationMemo({
      patient_name: "デモ山田",
      phone_number: "09000000000",
      is_new_patient: true,
      visit_reason: "無料歯科検診をお願いしたい",
      service_line: "free_screening",
      triage_level: "routine",
      preferred_date_1: "2026-10-20",
      preferred_time_range_1: "午前",
    }),
    transcript: [],
    channel: "phone",
    anchorAt: "2026-04-11T00:45:32.000Z",
  });

  assert.ok(screeningDraft.followUpChecklist.includes("無料なのは審査診断までと案内"));
  assert.ok(screeningDraft.followUpChecklist.includes("初診web問診は不要であることを確認"));
  assert.ok(
    screeningDraft.followUpChecklist.includes(
      "保険証 / マイナ保険証 / 自費分岐をスタッフ確認"
    )
  );

  const halitosisDraft = buildAppointmentDraft({
    conversationId: "conv_test_005b",
    memo: normalizeReservationMemo({
      patient_name: "デモ山田",
      phone_number: "09000000000",
      is_new_patient: true,
      visit_reason: "口臭検査を受けたい",
      service_line: "other_manual_review",
      triage_level: "manual_review",
      preferred_date_1: "2026-10-20",
      preferred_time_range_1: "午前",
    }),
    transcript: [
      {
        id: "ht1",
        role: "user",
        text: "口臭検査の予約をしたいです。",
        tentative: false,
        timeInCallSecs: 2,
      },
    ],
    channel: "phone",
    anchorAt: "2026-04-11T00:45:32.000Z",
  });

  assert.ok(
    halitosisDraft.followUpChecklist.some((item) => item.includes("2時間前から飲食不可"))
  );
});

test("reanalyze resets stale manual fallback state when routing changes back to routine", () => {
  const memo = normalizeReservationMemo({
    patient_name: "Demo Yamada",
    patient_name_yomi: "demo yamada",
    phone_number: "09000000000",
    is_new_patient: true,
    visit_reason: "right upper tooth feels sensitive and wants cleaning consultation",
    symptom_summary: "right upper tooth feels sensitive",
    urgency_reason: "wants cleaning consultation as well",
    preferred_date_1: "2026-10-20",
    preferred_time_range_1: "午前",
    preferred_date_2: "2026-10-22",
    preferred_time_range_2: "午後",
    callback_ok: true,
    notes_for_staff: "routine booking demo",
    booking_status: "manual_follow_up",
    service_line: "general_initial",
    triage_level: "doctor_required",
    line_form_status: "not_using_line",
    manual_review_reason: "call quality issue",
  });
  const transcript = [
    {
      id: "t1",
      role: "agent" as const,
      text: "LINEが未回答なら15分前にお越しください。",
      tentative: false,
      timeInCallSecs: 10,
    },
    {
      id: "t2",
      role: "user" as const,
      text: "LINEはまだやっていません。",
      tentative: false,
      timeInCallSecs: 12,
    },
  ];

  const staleStoredDraft = {
    ...buildAppointmentDraft({
      conversationId: "conv_test_006",
      memo,
      transcript,
      channel: "phone",
      anchorAt: "2026-04-11T00:45:32.000Z",
    }),
    triageLevel: "doctor_required" as const,
    lineFormStatus: "not_using_line" as const,
    bookingStatus: "manual_follow_up",
    manualReviewReason: "call quality issue",
    submissionState: "needs_manual_entry" as const,
    executionState: "manual_fallback" as const,
    executionError: "doctor confirmation required",
    notificationChannel: "slack" as const,
    notificationState: "sent" as const,
    notificationError: null,
    notifiedAt: "2026-04-10T15:59:43.808Z",
    conversationOutcome: "requires_manual_followup" as const,
    lastUpdatedAt: "2026-04-10T15:59:43.808Z",
  };

  const reanalyzedDraft = buildAppointmentDraft({
    conversationId: "conv_test_006",
    memo,
    transcript,
    channel: "phone",
    anchorAt: "2026-04-11T00:45:32.000Z",
    storedDraft: staleStoredDraft,
  });

  assert.equal(reanalyzedDraft.triageLevel, "routine");
  assert.equal(reanalyzedDraft.lineFormStatus, "needs_arrival_form");
  assert.equal(reanalyzedDraft.bookingStatus, "pending_auto_booking");
  assert.equal(reanalyzedDraft.submissionState, "drafted");
  assert.equal(reanalyzedDraft.executionState, "not_started");
  assert.equal(reanalyzedDraft.executionError, null);
  assert.equal(reanalyzedDraft.notificationChannel, null);
  assert.equal(reanalyzedDraft.notificationState, "not_sent");
  assert.equal(reanalyzedDraft.conversationOutcome, "pending");
});

test("reanalyze keeps submitted execution state once booking is already completed", () => {
  const draft = buildAppointmentDraft({
    conversationId: "conv_test_007",
    memo: normalizeReservationMemo({
      patient_name: "Demo Sato",
      patient_name_yomi: "demo sato",
      phone_number: "090-1234-5678",
      is_new_patient: true,
      visit_reason: "initial consultation",
      preferred_date_1: "2026-10-20",
      preferred_time_range_1: "午前",
    }),
    transcript: [],
    channel: "phone",
    anchorAt: "2026-04-11T00:45:32.000Z",
  });

  const submittedDraft = {
    ...draft,
    submissionState: "submitted" as const,
    executionState: "submitted" as const,
    notificationChannel: "slack" as const,
    notificationState: "sent" as const,
    conversationOutcome: "auto_booked" as const,
    notifiedAt: "2026-04-10T15:59:43.808Z",
    lastUpdatedAt: "2026-04-10T15:59:43.808Z",
  };

  const rebuiltDraft = buildAppointmentDraft({
    conversationId: "conv_test_007",
    memo: normalizeReservationMemo({
      patient_name: "Demo Sato",
      patient_name_yomi: "demo sato",
      phone_number: "090-1234-5678",
      is_new_patient: true,
      visit_reason: "initial consultation",
      preferred_date_1: "2026-10-20",
      preferred_time_range_1: "午前",
      line_form_status: "not_using_line",
    }),
    transcript: [
      {
        id: "t3",
        role: "user",
        text: "LINEはまだやっていません。",
        tentative: false,
        timeInCallSecs: 12,
      },
    ],
    channel: "phone",
    anchorAt: "2026-04-11T00:45:32.000Z",
    storedDraft: submittedDraft,
  });

  assert.equal(rebuiltDraft.submissionState, "submitted");
  assert.equal(rebuiltDraft.executionState, "submitted");
  assert.equal(rebuiltDraft.notificationState, "sent");
  assert.equal(rebuiltDraft.conversationOutcome, "auto_booked");
});

test("candidate selection prefers the earliest slot on the highest-priority preferred date", () => {
  const draft = buildAppointmentDraft({
    conversationId: "conv_test_008",
    memo: normalizeReservationMemo({
      patient_name: "山田 花子",
      patient_name_yomi: "やまだ はなこ",
      phone_number: "090-1234-5678",
      is_new_patient: true,
      visit_reason: "初診の予約をしたい",
      preferred_date_1: "2026-04-18",
      preferred_time_range_1: "午前",
      preferred_date_2: "2026-04-19",
      preferred_time_range_2: "夕方",
    }),
    transcript: [],
    channel: "phone",
    anchorAt: "2026-04-09T10:00:00.000Z",
  });

  const candidates = [
    createAvailabilityCandidate({
      date: "2026-04-19",
      tcStartTime: "17:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "診療ユニットA",
    }),
    createAvailabilityCandidate({
      date: "2026-04-18",
      tcStartTime: "10:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "診療ユニットA",
    }),
    createAvailabilityCandidate({
      date: "2026-04-18",
      tcStartTime: "09:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "診療ユニットA",
    }),
  ];

  const selected = selectBestAvailabilityCandidate({
    preferredSlots: draft.preferredSlots,
    availabilityCandidates: candidates,
  });

  assert.equal(selected?.date, "2026-04-18");
  assert.equal(selected?.tcStartTime, "09:00");
});

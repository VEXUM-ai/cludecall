import { EMIHA_KNOWLEDGE_PACK } from "@/lib/clinic-config/emiha";
import { resolvePreferredSlot } from "@/lib/date-preferences";
import { getServerConfig } from "@/lib/env";
import type {
  AppointmentAuditRef,
  AppointmentAvailabilityCandidate,
  AppointmentDraft,
  AppointmentExecutionState,
  AppointmentSubmissionMode,
  AppointmentSubmissionState,
  AppointmentToolPayload,
  ConversationChannel,
  LineFormStatus,
  ReservationMemo,
  ServiceLine,
  ServiceMenuMapping,
  TranscriptEntry,
  TriageLevel,
} from "@/lib/types";

type DraftPreferredSlot = AppointmentDraft["preferredSlots"][number];
type ResolvedPreferredSlotEntry = NonNullable<ReturnType<typeof resolvePreferredSlot>>;

const SERVICE_LINE_KEYWORDS: Array<{
  serviceLine: ServiceLine;
  keywords: string[];
}> = [
  {
    serviceLine: "free_screening",
    keywords: ["無料歯科検診", "無料検診", "歯科検診", "健診センター"],
  },
  {
    serviceLine: "implant_consult",
    keywords: ["インプラント", "implant", "ステント"],
  },
  {
    serviceLine: "thp_pretest",
    keywords: ["thp", "トータルヘルス", "事前検査"],
  },
  {
    serviceLine: "whitening",
    keywords: ["ホワイトニング", "えみほわ", "オフィスホワイトニング"],
  },
  {
    serviceLine: "invisalign",
    keywords: ["インビザ", "invisalign", "ipr", "リテーナー", "アタッチメント"],
  },
  {
    serviceLine: "emergency_initial",
    keywords: ["急患", "激痛", "強い痛み", "腫れ", "当日"],
  },
];

const MANUAL_REVIEW_KEYWORDS = [
  "リップアート",
  "糸リフト",
  "紹介",
  "レーザー",
  "口臭検査",
];

export const SERVICE_LINE_LABELS: Record<ServiceLine, string> = {
  general_initial: "通常初診",
  emergency_initial: "急患初診",
  implant_consult: "インプラント相談",
  thp_pretest: "THP事前検査",
  free_screening: "無料歯科検診",
  whitening: "ホワイトニング",
  invisalign: "インビザライン",
  other_manual_review: "個別確認案件",
};

export const TRIAGE_LEVEL_LABELS: Record<TriageLevel, string> = {
  routine: "通常",
  same_day_phone: "当日電話優先",
  doctor_required: "ドクター確認必須",
  manual_review: "人確認",
};

export const LINE_FORM_STATUS_LABELS: Record<LineFormStatus, string> = {
  completed: "LINE問診回答済み",
  needs_arrival_form: "来院時問診が必要",
  not_using_line: "LINE利用なし",
  unknown: "不明",
};

export const SUBMISSION_STATE_LABELS: Record<AppointmentSubmissionState, string> = {
  drafted: "仮受付ドラフト",
  confirmed_pending_submission: "レビュー承認済み / 実行待ち",
  needs_manual_entry: "人手登録待ち",
  submitted: "送信済み",
  submission_failed: "送信失敗",
};

export const EXECUTION_STATE_LABELS: Record<AppointmentExecutionState, string> = {
  not_started: "未着手",
  reviewed: "レビュー承認済み",
  availability_checked: "候補枠取得済み",
  executing: "投入中",
  submitted: "投入完了",
  manual_fallback: "手動対応へ切替",
  failed: "実行失敗",
};

const NON_ROUTINE_AUTOMATION_MESSAGES: Record<Exclude<TriageLevel, "routine">, string> = {
  same_day_phone:
    "急患や当日優先の問い合わせは v1 の自動候補枠確認・自動投入の対象外です。スタッフ折り返しで対応します。",
  doctor_required:
    "ドクター確認が必要な受付は v1 の自動候補枠確認・自動投入の対象外です。院内確認後の折り返し対応に寄せます。",
  manual_review:
    "この受付内容は v1 の自動候補枠確認・自動投入の対象外です。スタッフ確認後に折り返します。",
};

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function normalizeKeywordHit(text: string, keyword: string) {
  return text.includes(keyword.toLowerCase());
}

function joinConversationText(memo: ReservationMemo, transcript: TranscriptEntry[]) {
  return [
    memo.visit_reason,
    memo.symptom_summary,
    memo.notes_for_staff,
    memo.unresolved_questions,
    memo.preferred_datetime_raw,
    ...transcript.map((entry) => entry.text),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function resolveSubmissionMode(): AppointmentSubmissionMode {
  return getServerConfig().appointmentToolMode;
}

function resolveProvider() {
  return getServerConfig().appointmentToolProvider;
}

function addMinutesToTime(time: string, minutesToAdd: number) {
  const [hours, minutes] = time.split(":").map((value) => Number(value));
  const totalMinutes = hours * 60 + minutes + minutesToAdd;
  const nextHours = Math.floor(totalMinutes / 60);
  const nextMinutes = totalMinutes % 60;
  return `${String(nextHours).padStart(2, "0")}:${String(nextMinutes).padStart(2, "0")}`;
}

export function getAppointmentAutomationBlockReason(args: {
  triageLevel: TriageLevel;
  menuMapping: ServiceMenuMapping | null;
}): string | null {
  if (args.triageLevel !== "routine") {
    return NON_ROUTINE_AUTOMATION_MESSAGES[args.triageLevel];
  }

  if (!args.menuMapping || args.menuMapping.automationPolicy !== "rpa_supported") {
    return args.menuMapping?.notes[0] ?? "この受付区分は v1 では review 後も手動確認を優先します。";
  }

  return null;
}

export function normalizeServiceLine(
  rawValue: string | null | undefined,
  ...extraText: Array<string | null | undefined>
): ServiceLine | null {
  const normalized = normalizeComparableText(rawValue);
  const validValues: ServiceLine[] = [
    "general_initial",
    "emergency_initial",
    "implant_consult",
    "thp_pretest",
    "free_screening",
    "whitening",
    "invisalign",
    "other_manual_review",
  ];

  if (validValues.includes(normalized as ServiceLine)) {
    return normalized as ServiceLine;
  }

  const combinedText = [rawValue, ...extraText]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (MANUAL_REVIEW_KEYWORDS.some((keyword) => normalizeKeywordHit(combinedText, keyword))) {
    return "other_manual_review";
  }

  for (const entry of SERVICE_LINE_KEYWORDS) {
    if (entry.keywords.some((keyword) => normalizeKeywordHit(combinedText, keyword))) {
      return entry.serviceLine;
    }
  }

  if (combinedText.length === 0) {
    return null;
  }

  return "general_initial";
}

export function normalizeTriageLevel(
  rawValue: string | null | undefined,
  serviceLine: ServiceLine | null,
  ...extraText: Array<string | null | undefined>
): TriageLevel | null {
  const normalized = normalizeComparableText(rawValue);
  const validValues: TriageLevel[] = [
    "routine",
    "same_day_phone",
    "doctor_required",
    "manual_review",
  ];

  if (validValues.includes(normalized as TriageLevel)) {
    return normalized as TriageLevel;
  }

  const combinedText = [rawValue, ...extraText]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (serviceLine === "emergency_initial") {
    return "same_day_phone";
  }

  if (
    serviceLine === "implant_consult" ||
    serviceLine === "invisalign" ||
    normalizeKeywordHit(combinedText, "担当dr") ||
    normalizeKeywordHit(combinedText, "担当医")
  ) {
    return "doctor_required";
  }

  if (
    serviceLine === "other_manual_review" ||
    MANUAL_REVIEW_KEYWORDS.some((keyword) => normalizeKeywordHit(combinedText, keyword))
  ) {
    return "manual_review";
  }

  if (combinedText.includes("急患") || combinedText.includes("激痛")) {
    return "same_day_phone";
  }

  if (combinedText.length === 0) {
    return null;
  }

  return "routine";
}

export function normalizeLineFormStatus(
  rawValue: string | null | undefined,
  isNewPatient: boolean | null,
  ...extraText: Array<string | null | undefined>
): LineFormStatus | null {
  const normalized = normalizeComparableText(rawValue);
  const validValues: LineFormStatus[] = [
    "completed",
    "needs_arrival_form",
    "not_using_line",
    "unknown",
  ];

  if (validValues.includes(normalized as LineFormStatus)) {
    return normalized as LineFormStatus;
  }

  const combinedText = [rawValue, ...extraText]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (combinedText.includes("問診票回答済")) {
    return "completed";
  }

  if (combinedText.includes("line") && combinedText.includes("未回答")) {
    return "needs_arrival_form";
  }

  if (combinedText.includes("line") === false && combinedText.includes("問診") === false) {
    return isNewPatient ? "needs_arrival_form" : "unknown";
  }

  return "unknown";
}

function buildNormalizedPreferredSlots(
  memo: ReservationMemo,
  anchorAt: string,
  timeZone: string
): ResolvedPreferredSlotEntry[] {
  const candidates = [
    {
      label: "第1希望",
      rawDateText: memo.preferred_date_1,
      rawTimeRange: memo.preferred_time_range_1,
    },
    {
      label: "第2希望",
      rawDateText: memo.preferred_date_2,
      rawTimeRange: memo.preferred_time_range_2,
    },
  ];

  return candidates
    .map((candidate) => resolvePreferredSlot({ ...candidate, anchorAt, timeZone }))
    .filter((slot): slot is ResolvedPreferredSlotEntry => Boolean(slot));
}

function summarizeManualReviewReason(memo: ReservationMemo, serviceLine: ServiceLine) {
  const reasons: string[] = [];

  if (!memo.patient_name) {
    reasons.push("患者名未取得");
  }
  if (!memo.patient_name_yomi) {
    reasons.push("患者名の読み未取得");
  }
  if (!memo.phone_number) {
    reasons.push("電話番号未取得");
  }
  if (!memo.preferred_date_1 && !memo.preferred_time_range_1) {
    reasons.push("第1希望未取得");
  }
  if (memo.unresolved_questions) {
    reasons.push("未解決事項あり");
  }
  if (serviceLine === "other_manual_review") {
    reasons.push("人確認が必要な問い合わせ");
  }
  if (serviceLine === "emergency_initial") {
    reasons.push("急患初診のため当日電話案内優先");
  }
  if (memo.manual_review_reason) {
    reasons.push(memo.manual_review_reason);
  }

  return reasons.length > 0 ? reasons.join(" / ") : null;
}

function buildManualReviewReasonWithDateNotes(
  memo: ReservationMemo,
  serviceLine: ServiceLine,
  triageLevel: TriageLevel,
  menuMapping: ServiceMenuMapping | null,
  preferredSlotNotes: string[]
) {
  const baseReason = summarizeManualReviewReason(memo, serviceLine);
  const automationReason = getAppointmentAutomationBlockReason({
    triageLevel,
    menuMapping,
  });
  return [baseReason, automationReason, ...preferredSlotNotes].filter(Boolean).join(" / ") || null;
}

function buildHandoffSummary(
  memo: ReservationMemo,
  serviceLine: ServiceLine,
  triageLevel: TriageLevel,
  lineFormStatus: LineFormStatus
) {
  const summaryParts = [
    `受付区分: ${SERVICE_LINE_LABELS[serviceLine]}`,
    `優先度: ${TRIAGE_LEVEL_LABELS[triageLevel]}`,
    `LINE問診: ${LINE_FORM_STATUS_LABELS[lineFormStatus]}`,
  ];

  if (memo.visit_reason) {
    summaryParts.push(`主訴: ${memo.visit_reason}`);
  }
  if (memo.symptom_summary && memo.symptom_summary !== memo.visit_reason) {
    summaryParts.push(`症状要約: ${memo.symptom_summary}`);
  }
  if (memo.urgency_reason) {
    summaryParts.push(`緊急度理由: ${memo.urgency_reason}`);
  }
  if (memo.patient_name_yomi) {
    summaryParts.push(`氏名読み: ${memo.patient_name_yomi}`);
  }
  if (memo.notes_for_staff) {
    summaryParts.push(`メモ: ${memo.notes_for_staff}`);
  }
  if (memo.unresolved_questions) {
    summaryParts.push(`未解決: ${memo.unresolved_questions}`);
  }

  return summaryParts.join(" / ");
}

function buildHandoffSummaryWithDateNotes(
  memo: ReservationMemo,
  serviceLine: ServiceLine,
  triageLevel: TriageLevel,
  lineFormStatus: LineFormStatus,
  preferredSlotNotes: string[]
) {
  const baseSummary = buildHandoffSummary(memo, serviceLine, triageLevel, lineFormStatus);
  if (preferredSlotNotes.length === 0) {
    return baseSummary;
  }

  return `${baseSummary} / 希望解釈: ${preferredSlotNotes.join(" / ")}`;
}

function createAuditRef(
  current: AppointmentAuditRef | null,
  next: Partial<AppointmentAuditRef> & {
    lastAction: AppointmentAuditRef["lastAction"];
  }
): AppointmentAuditRef {
  return {
    auditId: next.auditId ?? current?.auditId ?? null,
    logPath: next.logPath ?? current?.logPath ?? null,
    screenshotPaths: next.screenshotPaths ?? current?.screenshotPaths ?? [],
    lastAction: next.lastAction,
    updatedAt: next.updatedAt ?? new Date().toISOString(),
  };
}

function syncPayloadFromDraft(draft: AppointmentDraft): AppointmentDraft {
  return {
    ...draft,
    appointmentToolPayload: {
      ...draft.appointmentToolPayload,
      request: {
        ...draft.appointmentToolPayload.request,
        serviceLine: draft.serviceLine,
        visitReason: draft.visitReason,
        symptomSummary: draft.symptomSummary,
        preferredSlots: draft.preferredSlots,
        callbackOk: draft.callbackOk,
        lineFormStatus: draft.lineFormStatus,
        triageLevel: draft.triageLevel,
        urgencyReason: draft.urgencyReason,
      },
      internal: {
        ...draft.appointmentToolPayload.internal,
        bookingStatus: draft.bookingStatus,
        notesForStaff: draft.notesForStaff,
        unresolvedQuestions: draft.unresolvedQuestions,
        manualReviewReason: draft.manualReviewReason,
        handoffSummary: draft.handoffSummary,
      },
      integration: {
        ...draft.appointmentToolPayload.integration,
        provider: draft.provider,
        mode: draft.submissionMode,
        knowledgeVersion: draft.knowledgeVersion,
        menuMapping: draft.menuMapping,
      },
      execution: {
        availabilityCandidates: draft.availabilityCandidates,
        state: draft.executionState,
        error: draft.executionError,
        reviewedBy: draft.reviewedBy,
        reviewedAt: draft.reviewedAt,
        selectedCandidateId: draft.selectedCandidateId,
        auditRef: draft.auditRef,
      },
    },
  };
}

function buildAppointmentToolPayload(args: {
  memo: ReservationMemo;
  preferredSlots: DraftPreferredSlot[];
  normalizedManualReviewReason: string | null;
  serviceLine: ServiceLine;
  triageLevel: TriageLevel;
  lineFormStatus: LineFormStatus;
  handoffSummary: string;
  channel: ConversationChannel;
  menuMapping: ServiceMenuMapping | null;
}): AppointmentToolPayload {
  return {
    clinic: {
      name: EMIHA_KNOWLEDGE_PACK.publicProfile.clinicName,
      phoneNumber: EMIHA_KNOWLEDGE_PACK.publicProfile.phoneNumber,
    },
    patient: {
      name: args.memo.patient_name,
      nameYomi: args.memo.patient_name_yomi,
      phoneNumber: args.memo.phone_number,
      isNewPatient: args.memo.is_new_patient,
    },
    request: {
      serviceLine: args.serviceLine,
      visitReason: args.memo.visit_reason,
      symptomSummary: args.memo.symptom_summary,
      preferredSlots: args.preferredSlots,
      callbackOk: args.memo.callback_ok,
      lineFormStatus: args.lineFormStatus,
      triageLevel: args.triageLevel,
      urgencyReason: args.memo.urgency_reason,
    },
    internal: {
      bookingStatus: args.memo.booking_status,
      notesForStaff: args.memo.notes_for_staff,
      unresolvedQuestions: args.memo.unresolved_questions,
      manualReviewReason: args.normalizedManualReviewReason,
      handoffSummary: args.handoffSummary,
    },
    integration: {
      provider: resolveProvider(),
      mode: resolveSubmissionMode(),
      sourceChannel: args.channel,
      knowledgeVersion: EMIHA_KNOWLEDGE_PACK.version,
      menuMapping: args.menuMapping,
    },
    execution: {
      availabilityCandidates: [],
      state: "not_started",
      error: null,
      reviewedBy: null,
      reviewedAt: null,
      selectedCandidateId: null,
      auditRef: null,
    },
  };
}

function mergeStoredState(base: AppointmentDraft, stored: AppointmentDraft | null) {
  if (!stored) {
    return syncPayloadFromDraft(base);
  }

  return syncPayloadFromDraft({
    ...base,
    submissionState: stored.submissionState,
    executionState: stored.executionState,
    executionError: stored.executionError,
    availabilityCandidates: stored.availabilityCandidates,
    reviewedBy: stored.reviewedBy,
    reviewedAt: stored.reviewedAt,
    selectedCandidateId: stored.selectedCandidateId,
    confirmedAt: stored.confirmedAt,
    lastUpdatedAt: stored.lastUpdatedAt,
    auditRef: stored.auditRef,
  });
}

export function findServiceMenuMapping(serviceLine: ServiceLine) {
  return (
    EMIHA_KNOWLEDGE_PACK.menuMappings.find((mapping) => mapping.serviceLine === serviceLine) ??
    null
  );
}

export function buildAppointmentDraft(args: {
  conversationId: string;
  memo: ReservationMemo;
  transcript: TranscriptEntry[];
  channel: ConversationChannel;
  anchorAt?: string | null;
  storedDraft?: AppointmentDraft | null;
}): AppointmentDraft {
  const combinedText = joinConversationText(args.memo, args.transcript);
  const timeZone = getServerConfig().demoTimezone;
  const anchorAt = args.anchorAt ?? new Date().toISOString();
  const serviceLine =
    normalizeServiceLine(
      args.memo.service_line,
      args.memo.visit_reason,
      args.memo.symptom_summary,
      args.memo.notes_for_staff,
      combinedText
    ) ?? "other_manual_review";
  const triageLevel =
    normalizeTriageLevel(
      args.memo.triage_level,
      serviceLine,
      args.memo.visit_reason,
      args.memo.symptom_summary,
      args.memo.urgency_reason,
      args.memo.notes_for_staff,
      combinedText
    ) ??
    (serviceLine === "emergency_initial" ? "same_day_phone" : "routine");
  const lineFormStatus =
    normalizeLineFormStatus(
      args.memo.line_form_status,
      args.memo.is_new_patient,
      args.memo.notes_for_staff,
      combinedText
    ) ?? "unknown";
  const preferredSlotEntries = buildNormalizedPreferredSlots(
    args.memo,
    anchorAt,
    timeZone
  );
  const preferredSlots = preferredSlotEntries.map((entry) => entry.slot);
  const preferredSlotNotes = preferredSlotEntries
    .map((entry) => entry.reviewNote ?? entry.handoffNote)
    .filter((note): note is string => Boolean(note));
  const menuMapping = findServiceMenuMapping(serviceLine);
  const normalizedManualReviewReason = buildManualReviewReasonWithDateNotes(
    args.memo,
    serviceLine,
    triageLevel,
    menuMapping,
    preferredSlotNotes
  );
  const handoffSummary = buildHandoffSummaryWithDateNotes(
    args.memo,
    serviceLine,
    triageLevel,
    lineFormStatus,
    preferredSlotNotes
  );
  const now = new Date().toISOString();

  const draft: AppointmentDraft = {
    conversationId: args.conversationId,
    clinicName: EMIHA_KNOWLEDGE_PACK.publicProfile.clinicName,
    patientName: args.memo.patient_name,
    patientNameYomi: args.memo.patient_name_yomi,
    phoneNumber: args.memo.phone_number,
    isNewPatient: args.memo.is_new_patient,
    serviceLine,
    triageLevel,
    lineFormStatus,
    visitReason: args.memo.visit_reason,
    symptomSummary: args.memo.symptom_summary,
    urgencyReason: args.memo.urgency_reason,
    preferredSlots,
    callbackOk: args.memo.callback_ok,
    notesForStaff: args.memo.notes_for_staff,
    unresolvedQuestions: args.memo.unresolved_questions,
    bookingStatus: args.memo.booking_status,
    manualReviewReason: normalizedManualReviewReason,
    handoffSummary,
    submissionMode: resolveSubmissionMode(),
    submissionState: "drafted",
    provider: resolveProvider(),
    knowledgeVersion: args.memo.knowledge_version ?? EMIHA_KNOWLEDGE_PACK.version,
    menuMapping,
    availabilityCandidates: [],
    executionState: "not_started",
    executionError: null,
    reviewedBy: null,
    reviewedAt: null,
    selectedCandidateId: null,
    auditRef: null,
    confirmedAt: null,
    lastUpdatedAt: now,
    appointmentToolPayload: buildAppointmentToolPayload({
      memo: args.memo,
      preferredSlots,
      normalizedManualReviewReason,
      serviceLine,
      triageLevel,
      lineFormStatus,
      handoffSummary,
      channel: args.channel,
      menuMapping,
    }),
  };

  return mergeStoredState(draft, args.storedDraft ?? null);
}

export function confirmAppointmentDraft(
  draft: AppointmentDraft,
  reviewedBy: string | null
): AppointmentDraft {
  const now = new Date().toISOString();

  return syncPayloadFromDraft({
    ...draft,
    submissionState: "confirmed_pending_submission",
    executionState: draft.executionState === "submitted" ? "submitted" : "reviewed",
    executionError: null,
    reviewedBy,
    reviewedAt: now,
    confirmedAt: now,
    lastUpdatedAt: now,
    auditRef: createAuditRef(draft.auditRef, {
      lastAction: "review",
      updatedAt: now,
    }),
  });
}

export function applyAvailabilityResults(
  draft: AppointmentDraft,
  candidates: AppointmentAvailabilityCandidate[],
  auditRef: AppointmentAuditRef | null,
  error: string | null = null
): AppointmentDraft {
  const now = new Date().toISOString();
  return syncPayloadFromDraft({
    ...draft,
    availabilityCandidates: candidates,
    executionState: error ? "manual_fallback" : "availability_checked",
    executionError: error,
    selectedCandidateId: candidates[0]?.id ?? draft.selectedCandidateId,
    lastUpdatedAt: now,
    auditRef: auditRef
      ? createAuditRef(draft.auditRef, { ...auditRef, lastAction: "availability", updatedAt: now })
      : createAuditRef(draft.auditRef, { lastAction: "availability", updatedAt: now }),
  });
}

export function markAppointmentExecutionStarted(
  draft: AppointmentDraft,
  selectedCandidateId: string
): AppointmentDraft {
  return syncPayloadFromDraft({
    ...draft,
    executionState: "executing",
    executionError: null,
    selectedCandidateId,
    lastUpdatedAt: new Date().toISOString(),
  });
}

export function markAppointmentExecutionSubmitted(
  draft: AppointmentDraft,
  selectedCandidateId: string,
  auditRef: AppointmentAuditRef | null
): AppointmentDraft {
  const now = new Date().toISOString();
  return syncPayloadFromDraft({
    ...draft,
    submissionState: "submitted",
    executionState: "submitted",
    executionError: null,
    selectedCandidateId,
    lastUpdatedAt: now,
    auditRef: auditRef
      ? createAuditRef(draft.auditRef, { ...auditRef, lastAction: "execute", updatedAt: now })
      : createAuditRef(draft.auditRef, { lastAction: "execute", updatedAt: now }),
  });
}

export function markAppointmentExecutionFailed(
  draft: AppointmentDraft,
  error: string,
  auditRef: AppointmentAuditRef | null,
  fallbackToManual = false
): AppointmentDraft {
  const now = new Date().toISOString();
  return syncPayloadFromDraft({
    ...draft,
    submissionState: fallbackToManual ? "needs_manual_entry" : "submission_failed",
    executionState: fallbackToManual ? "manual_fallback" : "failed",
    executionError: error,
    lastUpdatedAt: now,
    auditRef: auditRef
      ? createAuditRef(draft.auditRef, { ...auditRef, lastAction: "execute", updatedAt: now })
      : createAuditRef(draft.auditRef, { lastAction: "execute", updatedAt: now }),
  });
}

export function buildExecutionCandidatePreview(
  candidate: AppointmentAvailabilityCandidate
) {
  return `${candidate.date} ${candidate.tcStartTime} / ${candidate.tcUnit} -> ${candidate.treatmentUnit}`;
}

export function createAvailabilityCandidate(args: {
  date: string;
  tcStartTime: string;
  tcUnit: string;
  treatmentUnit: string;
  notes?: string[];
}): AppointmentAvailabilityCandidate {
  return {
    id: crypto.randomUUID(),
    provider: "apotool_rpa",
    date: args.date,
    tcStartTime: args.tcStartTime,
    tcEndTime: addMinutesToTime(args.tcStartTime, 30),
    treatmentStartTime: addMinutesToTime(args.tcStartTime, 30),
    treatmentEndTime: addMinutesToTime(args.tcStartTime, 90),
    tcUnit: args.tcUnit,
    treatmentUnit: args.treatmentUnit,
    label: `${args.date} ${args.tcStartTime}`,
    notes: args.notes ?? [],
  };
}

export function findBookingRule(serviceLine: ServiceLine) {
  return (
    EMIHA_KNOWLEDGE_PACK.bookingRules.find((rule) => rule.serviceLine === serviceLine) ??
    EMIHA_KNOWLEDGE_PACK.bookingRules.find(
      (rule) => rule.serviceLine === "other_manual_review"
    ) ??
    null
  );
}

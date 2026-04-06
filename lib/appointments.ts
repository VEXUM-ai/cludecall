import { EMIHA_BOOKING_RULES, EMIHA_CLINIC_PROFILE } from "@/lib/clinic-config/emiha";
import { resolvePreferredSlot } from "@/lib/date-preferences";
import { getServerConfig } from "@/lib/env";
import type {
  AppointmentDraft,
  AppointmentSubmissionMode,
  AppointmentSubmissionState,
  AppointmentToolPayload,
  ConversationChannel,
  LineFormStatus,
  ReservationMemo,
  ServiceLine,
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
  confirmed_pending_submission: "確認済み / 送信待ち",
  needs_manual_entry: "人手登録待ち",
  submitted: "送信済み",
  submission_failed: "送信失敗",
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
    memo.notes_for_staff,
    memo.unresolved_questions,
    ...transcript.map((entry) => entry.text),
  ]
    .filter((value): value is string => Boolean(value))
    .join("\n");
}

function resolveSubmissionMode(): AppointmentSubmissionMode {
  return getServerConfig().appointmentToolMode;
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

function buildPreferredSlots(memo: ReservationMemo) {
  return [
    {
      label: "第1希望",
      date: memo.preferred_date_1,
      timeRange: memo.preferred_time_range_1,
    },
    {
      label: "第2希望",
      date: memo.preferred_date_2,
      timeRange: memo.preferred_time_range_2,
    },
  ].filter((slot) => slot.date || slot.timeRange);
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

function buildManualReviewReasonWithDateNotes(
  memo: ReservationMemo,
  serviceLine: ServiceLine,
  preferredSlotNotes: string[]
) {
  const baseReason = summarizeManualReviewReason(memo, serviceLine);
  return [baseReason, ...preferredSlotNotes].filter(Boolean).join(" / ") || null;
}

function summarizeManualReviewReason(memo: ReservationMemo, serviceLine: ServiceLine) {
  const reasons: string[] = [];

  if (!memo.patient_name) {
    reasons.push("患者名未取得");
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

function buildAppointmentToolPayload(args: {
  memo: ReservationMemo;
  preferredSlots: DraftPreferredSlot[];
  normalizedManualReviewReason: string | null;
  serviceLine: ServiceLine;
  triageLevel: TriageLevel;
  lineFormStatus: LineFormStatus;
  handoffSummary: string;
  channel: ConversationChannel;
}): AppointmentToolPayload {
  const config = getServerConfig();

  return {
    clinic: {
      name: EMIHA_CLINIC_PROFILE.clinicName,
      phoneNumber: EMIHA_CLINIC_PROFILE.phoneNumber,
    },
    patient: {
      name: args.memo.patient_name,
      phoneNumber: args.memo.phone_number,
      isNewPatient: args.memo.is_new_patient,
    },
    request: {
      serviceLine: args.serviceLine,
      visitReason: args.memo.visit_reason,
      preferredSlots: args.preferredSlots,
      callbackOk: args.memo.callback_ok,
      lineFormStatus: args.lineFormStatus,
      triageLevel: args.triageLevel,
    },
    internal: {
      bookingStatus: args.memo.booking_status,
      notesForStaff: args.memo.notes_for_staff,
      unresolvedQuestions: args.memo.unresolved_questions,
      manualReviewReason: args.normalizedManualReviewReason,
      handoffSummary: args.handoffSummary,
    },
    integration: {
      provider: config.appointmentToolProvider,
      mode: config.appointmentToolMode,
      sourceChannel: args.channel,
    },
  };
}

function mergeStoredState(base: AppointmentDraft, stored: AppointmentDraft | null) {
  if (!stored) {
    return base;
  }

  return {
    ...base,
    submissionMode: stored.submissionMode,
    submissionState: stored.submissionState,
    confirmedAt: stored.confirmedAt,
    lastUpdatedAt: stored.lastUpdatedAt,
  };
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
      args.memo.notes_for_staff,
      combinedText
    ) ?? "other_manual_review";
  const triageLevel =
    normalizeTriageLevel(
      args.memo.triage_level,
      serviceLine,
      args.memo.visit_reason,
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
  const normalizedManualReviewReason = buildManualReviewReasonWithDateNotes(
    args.memo,
    serviceLine,
    preferredSlotNotes
  );
  const handoffSummary = buildHandoffSummaryWithDateNotes(
    args.memo,
    serviceLine,
    triageLevel,
    lineFormStatus,
    preferredSlotNotes
  );
  const submissionMode = resolveSubmissionMode();
  const now = new Date().toISOString();

  const draft: AppointmentDraft = {
    conversationId: args.conversationId,
    clinicName: EMIHA_CLINIC_PROFILE.clinicName,
    patientName: args.memo.patient_name,
    phoneNumber: args.memo.phone_number,
    isNewPatient: args.memo.is_new_patient,
    serviceLine,
    triageLevel,
    lineFormStatus,
    visitReason: args.memo.visit_reason,
    preferredSlots,
    callbackOk: args.memo.callback_ok,
    notesForStaff: args.memo.notes_for_staff,
    unresolvedQuestions: args.memo.unresolved_questions,
    bookingStatus: args.memo.booking_status,
    manualReviewReason: normalizedManualReviewReason,
    handoffSummary,
    submissionMode,
    submissionState: "drafted",
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
    }),
  };

  return mergeStoredState(draft, args.storedDraft ?? null);
}

export function confirmAppointmentDraft(draft: AppointmentDraft): AppointmentDraft {
  const now = new Date().toISOString();
  const nextState: AppointmentSubmissionState =
    draft.submissionMode === "manual_review"
      ? "needs_manual_entry"
      : "confirmed_pending_submission";

  return {
    ...draft,
    submissionState: nextState,
    confirmedAt: now,
    lastUpdatedAt: now,
  };
}

export function findBookingRule(serviceLine: ServiceLine) {
  return (
    EMIHA_BOOKING_RULES.find((rule) => rule.serviceLine === serviceLine) ??
    EMIHA_BOOKING_RULES.find((rule) => rule.serviceLine === "other_manual_review") ??
    null
  );
}

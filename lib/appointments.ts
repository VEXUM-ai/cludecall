import { EMIHA_KNOWLEDGE_PACK } from "@/lib/clinic-config/emiha";
import { resolvePreferredSlot } from "@/lib/date-preferences";
import { getServerConfig } from "@/lib/env";
import type {
  AppointmentAuditRef,
  AppointmentAvailabilityCandidate,
  AppointmentDraft,
  AppointmentExecutionState,
  ConversationOutcome,
  HandoffState,
  NotificationChannel,
  NotificationState,
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
    keywords: ["急患", "激痛", "強い痛み", "腫れ", "出血", "今日診て", "本日診て", "今日このあと", "今すぐ"],
  },
];

const MANUAL_REVIEW_KEYWORDS = [
  "リップアート",
  "糸リフト",
  "紹介",
  "レーザー",
  "口臭検査",
];

const HALITOSIS_KEYWORDS = ["口臭検査", "口臭", "におい", "臭い"];
const REFERRAL_KEYWORDS = ["紹介", "紹介状", "大学病院", "メディグル", "大阪歯科大学"];
const AESTHETIC_KEYWORDS = ["リップアート", "糸リフト", "美容"];
const LASER_KEYWORDS = ["レーザー", "粘液嚢胞", "口内炎"];

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

export const CONVERSATION_OUTCOME_LABELS: Record<ConversationOutcome, string> = {
  pending: "処理待ち",
  auto_booked: "自動予約済み",
  requires_manual_followup: "要確認",
  live_handoff: "人対応へ引き継ぎ",
  failed: "処理失敗",
};

export const HANDOFF_STATE_LABELS: Record<HandoffState, string> = {
  not_applicable: "対象外",
  requires_live_handoff: "live転送対象",
  handoff_unknown: "転送結果不明",
};

export const NOTIFICATION_STATE_LABELS: Record<NotificationState, string> = {
  not_sent: "未通知",
  sent: "通知済み",
  skipped: "通知スキップ",
  failed: "通知失敗",
};

const NON_ROUTINE_AUTOMATION_MESSAGES: Record<Exclude<TriageLevel, "routine">, string> = {
  same_day_phone:
    "急患や当日優先の問い合わせは Apotool 自動投入の対象外です。通話中にスタッフへ電話転送する前提です。",
  doctor_required:
    "ドクター確認が必要な受付は自動投入の対象外です。院内確認のうえ人手対応に切り替えます。",
  manual_review:
    "この受付内容は自動投入の対象外です。スタッフ確認のうえ人手対応に切り替えます。",
};

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").toLowerCase();
}

function normalizeKeywordHit(text: string, keyword: string) {
  return text.includes(keyword.toLowerCase());
}

function includesAny(text: string, keywords: string[]) {
  return keywords.some((keyword) => normalizeKeywordHit(text, keyword));
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

function defaultHandoffState(triageLevel: TriageLevel): HandoffState {
  return triageLevel === "same_day_phone" ? "requires_live_handoff" : "not_applicable";
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
  const combinedText = [rawValue, ...extraText]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  const isUrgent =
    serviceLine === "emergency_initial" ||
    includesAny(combinedText, [
      "急患",
      "激痛",
      "強い痛み",
      "腫れ",
      "出血",
      "今日診て",
      "本日診て",
      "今日このあと",
      "今すぐ",
      "夜眠れない",
    ]);
  if (isUrgent || normalized === "same_day_phone") {
    return "same_day_phone";
  }

  const requiresDoctor =
    serviceLine === "implant_consult" ||
    serviceLine === "invisalign" ||
    includesAny(combinedText, ["担当dr", "担当医", "ドクター確認", "担当ドクター"]);
  if (requiresDoctor || (normalized === "doctor_required" && serviceLine !== "general_initial")) {
    return "doctor_required";
  }

  const requiresManualReview =
    serviceLine === "other_manual_review" || includesAny(combinedText, MANUAL_REVIEW_KEYWORDS);
  if (
    requiresManualReview ||
    (normalized === "manual_review" &&
      serviceLine !== "general_initial" &&
      serviceLine !== "free_screening" &&
      serviceLine !== "whitening" &&
      serviceLine !== "thp_pretest")
  ) {
    return "manual_review";
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
  const combinedText = [rawValue, ...extraText]
    .filter((value): value is string => Boolean(value))
    .join("\n")
    .toLowerCase();

  if (
    includesAny(combinedText, ["問診票回答済", "回答済み", "line問診済", "line回答済"]) &&
    !includesAny(combinedText, ["未回答", "まだ", "やってない", "していない"])
  ) {
    return "completed";
  }

  if (
    includesAny(combinedText, ["line", "ライン", "問診"]) &&
    includesAny(combinedText, ["未回答", "まだ", "やってない", "していない", "未実施"])
  ) {
    return "needs_arrival_form";
  }

  const validValues: LineFormStatus[] = [
    "completed",
    "needs_arrival_form",
    "not_using_line",
    "unknown",
  ];

  if (validValues.includes(normalized as LineFormStatus)) {
    return normalized as LineFormStatus;
  }

  if (combinedText.includes("line") === false && combinedText.includes("問診") === false) {
    return isNewPatient ? "needs_arrival_form" : "unknown";
  }

  return "unknown";
}

function deriveBookingStatus(args: {
  rawBookingStatus: string | null | undefined;
  appointmentCompleted: boolean | null | undefined;
  triageLevel: TriageLevel;
  menuMapping: ServiceMenuMapping | null;
}) {
  const normalized = normalizeComparableText(args.rawBookingStatus);
  if (args.triageLevel === "same_day_phone") {
    return "transferred";
  }

  if (getAppointmentAutomationBlockReason(args) !== null) {
    return "manual_follow_up";
  }

  if (normalized === "booked" || normalized === "failed") {
    return normalized;
  }

  if (args.appointmentCompleted === true) {
    return "booked";
  }

  return "pending_auto_booking";
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

function dedupeChecklist(items: Array<string | null | undefined>) {
  const seen = new Set<string>();
  const result: string[] = [];

  for (const item of items) {
    const normalized = item?.trim();
    if (!normalized || seen.has(normalized)) {
      continue;
    }
    seen.add(normalized);
    result.push(normalized);
  }

  return result;
}

function buildFollowUpChecklist(args: {
  memo: ReservationMemo;
  serviceLine: ServiceLine;
  triageLevel: TriageLevel;
  lineFormStatus: LineFormStatus;
  combinedText: string;
}) {
  const normalizedText = args.combinedText.toLowerCase();
  const hasHalitosisTopic = includesAny(normalizedText, HALITOSIS_KEYWORDS);
  const hasReferralTopic = includesAny(normalizedText, REFERRAL_KEYWORDS);
  const hasAestheticTopic = includesAny(normalizedText, AESTHETIC_KEYWORDS);
  const hasLaserTopic = includesAny(normalizedText, LASER_KEYWORDS);

  const commonItems = [
    args.lineFormStatus === "needs_arrival_form"
      ? "LINE問診が未回答なら15分前来院をご案内"
      : null,
    args.memo.appointment_completed === true && args.memo.scheduled_datetime
      ? `既存分析上の予約完了時刻を確認: ${args.memo.scheduled_datetime}`
      : null,
  ];

  const byServiceLine: Record<ServiceLine, Array<string | null>> = {
    general_initial: [
      "初診はTC30分 + 治療枠60分の前提で確認",
      "初診当日の親知らず抜歯は案内しない",
      "前日確認電話の要否を確認",
      hasHalitosisTopic
        ? "口臭検査の注意事項を確認: 2時間前から飲食不可 / 前日・当日の強いにおいの食事不可 / マウスウォッシュ不可"
        : null,
    ],
    emergency_initial: [
      "待ち時間が30分以上になる可能性を案内",
      "応急処置のみになる可能性を案内",
      "場所が不安なら20分前来院をご案内",
    ],
    implant_consult: [
      "インプラント詳細フローはスタッフ確認に切り替える",
      "鎮静の有無を確認",
      "帰宅手段を確認",
      "支払い方法を確認",
      "同意書未回収なら回収要否を確認",
    ],
    thp_pretest: [
      "THPは90分 / 9,500円の案内を確認",
      "検体到着後2〜3週間後のTC調整運用を確認",
    ],
    free_screening: [
      "無料なのは審査診断までと案内",
      "初診web問診は不要であることを確認",
      "保険証 / マイナ保険証 / 自費分岐をスタッフ確認",
      "当日治療希望の有無に応じて所要時間を確認",
      "検診票またはメール案内の持参を確認",
    ],
    whitening: [
      "ホワイトニングは機材1台のため重複不可で確認",
    ],
    invisalign: [
      "インビザラインは担当ドクター日程で調整",
      "必要ならテンプレート持参案内を確認",
    ],
    other_manual_review: [
      hasReferralTopic ? "紹介先と予約方法はスタッフ確認で案内" : null,
      hasAestheticTopic ? "美容系は見市担当前提で人確認へ" : null,
      hasLaserTopic ? "レーザー可否は口腔内所見次第のため人確認へ" : null,
      hasHalitosisTopic
        ? "口臭検査の注意事項を確認: 2時間前から飲食不可 / 前日・当日の強いにおいの食事不可 / マウスウォッシュ不可"
        : null,
    ],
  };

  return dedupeChecklist([
    ...commonItems,
    ...byServiceLine[args.serviceLine],
    args.triageLevel === "same_day_phone" ? "急患のため live 転送を優先" : null,
  ]);
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
    reasons.push("急患初診のため通話中の人対応へ切替");
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
  const baseReason =
    triageLevel === "routine" ? summarizeManualReviewReason({ ...memo, manual_review_reason: null }, serviceLine) : summarizeManualReviewReason(memo, serviceLine);
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
        scheduledDatetime: draft.scheduledDatetime,
        appointmentCompleted: draft.appointmentCompleted,
        notesForStaff: draft.notesForStaff,
        unresolvedQuestions: draft.unresolvedQuestions,
        manualReviewReason: draft.manualReviewReason,
        handoffSummary: draft.handoffSummary,
        followUpChecklist: draft.followUpChecklist,
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
        notificationChannel: draft.notificationChannel,
        notificationState: draft.notificationState,
        notificationError: draft.notificationError,
        notifiedAt: draft.notifiedAt,
        handoffState: draft.handoffState,
        outcome: draft.conversationOutcome,
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
      nameYomi: null,
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
      scheduledDatetime: args.memo.scheduled_datetime,
      appointmentCompleted: args.memo.appointment_completed,
      notesForStaff: args.memo.notes_for_staff,
      unresolvedQuestions: args.memo.unresolved_questions,
      manualReviewReason: args.normalizedManualReviewReason,
      handoffSummary: args.handoffSummary,
      followUpChecklist: [],
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
      notificationChannel: null,
      notificationState: "not_sent",
      notificationError: null,
      notifiedAt: null,
      handoffState: defaultHandoffState(args.triageLevel),
      outcome: "pending",
    },
  };
}

function samePreferredSlots(
  left: AppointmentDraft["preferredSlots"],
  right: AppointmentDraft["preferredSlots"]
) {
  if (left.length !== right.length) {
    return false;
  }

  return left.every((slot, index) => {
    const other = right[index];
    return (
      other?.label === slot.label &&
      other?.date === slot.date &&
      other?.timeRange === slot.timeRange
    );
  });
}

function shouldPreserveStoredExecutionState(
  base: AppointmentDraft,
  stored: AppointmentDraft
) {
  const alreadySubmitted =
    stored.submissionState === "submitted" ||
    stored.executionState === "submitted" ||
    stored.conversationOutcome === "auto_booked";
  if (alreadySubmitted) {
    return true;
  }

  return (
    base.submissionMode === stored.submissionMode &&
    base.provider === stored.provider &&
    base.knowledgeVersion === stored.knowledgeVersion &&
    base.serviceLine === stored.serviceLine &&
    base.triageLevel === stored.triageLevel &&
    base.lineFormStatus === stored.lineFormStatus &&
    base.bookingStatus === stored.bookingStatus &&
    base.scheduledDatetime === stored.scheduledDatetime &&
    base.appointmentCompleted === stored.appointmentCompleted &&
    base.menuMapping?.serviceLine === stored.menuMapping?.serviceLine &&
    base.menuMapping?.automationPolicy === stored.menuMapping?.automationPolicy &&
    samePreferredSlots(base.preferredSlots, stored.preferredSlots)
  );
}

function mergeStoredState(base: AppointmentDraft, stored: AppointmentDraft | null) {
  if (!stored) {
    return syncPayloadFromDraft(base);
  }

  if (!shouldPreserveStoredExecutionState(base, stored)) {
    return syncPayloadFromDraft(base);
  }

  return syncPayloadFromDraft({
    ...base,
    scheduledDatetime: stored.scheduledDatetime,
    appointmentCompleted: stored.appointmentCompleted,
    followUpChecklist: stored.followUpChecklist,
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
    notificationChannel: stored.notificationChannel,
    notificationState: stored.notificationState,
    notificationError: stored.notificationError,
    notifiedAt: stored.notifiedAt,
    handoffState: stored.handoffState,
    conversationOutcome: stored.conversationOutcome,
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
  const bookingStatus = deriveBookingStatus({
    rawBookingStatus: args.memo.booking_status,
    appointmentCompleted: args.memo.appointment_completed,
    triageLevel,
    menuMapping,
  });
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
  const followUpChecklist = buildFollowUpChecklist({
    memo: args.memo,
    serviceLine,
    triageLevel,
    lineFormStatus,
    combinedText,
  });
  const now = new Date().toISOString();

  const draft: AppointmentDraft = {
    conversationId: args.conversationId,
    clinicName: EMIHA_KNOWLEDGE_PACK.publicProfile.clinicName,
    patientName: args.memo.patient_name,
    patientNameYomi: null,
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
    bookingStatus,
    scheduledDatetime: args.memo.scheduled_datetime,
    appointmentCompleted: args.memo.appointment_completed,
    manualReviewReason: normalizedManualReviewReason,
    handoffSummary,
    followUpChecklist,
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
    notificationChannel: null,
    notificationState: "not_sent",
    notificationError: null,
    notifiedAt: null,
    handoffState: defaultHandoffState(triageLevel),
    conversationOutcome: "pending",
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

export function updateAppointmentDraft(
  draft: AppointmentDraft,
  updates: Partial<
    Pick<
      AppointmentDraft,
      | "submissionState"
      | "executionState"
      | "executionError"
      | "selectedCandidateId"
      | "auditRef"
      | "reviewedBy"
      | "reviewedAt"
      | "confirmedAt"
      | "manualReviewReason"
      | "notificationChannel"
      | "notificationState"
      | "notificationError"
      | "notifiedAt"
      | "handoffState"
      | "conversationOutcome"
    >
  >
) {
  return syncPayloadFromDraft({
    ...draft,
    ...updates,
    lastUpdatedAt: new Date().toISOString(),
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
  const selectedCandidate =
    draft.availabilityCandidates.find((candidate) => candidate.id === selectedCandidateId) ?? null;
  return syncPayloadFromDraft({
    ...draft,
    submissionState: "submitted",
    executionState: "submitted",
    executionError: null,
    selectedCandidateId,
    bookingStatus: "booked",
    scheduledDatetime: selectedCandidate
      ? `${selectedCandidate.date} ${selectedCandidate.tcStartTime}`
      : draft.scheduledDatetime,
    appointmentCompleted: true,
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
    appointmentCompleted: false,
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

function parseCandidateTime(value: string) {
  const [hours, minutes] = value.split(":").map((item) => Number.parseInt(item, 10));
  return hours * 60 + minutes;
}

function timeRangePenalty(timeRange: string | null, candidateMinutes: number) {
  if (!timeRange) {
    return candidateMinutes;
  }

  const exactTime = timeRange.match(/(\d{1,2}):(\d{2})/);
  if (exactTime) {
    const targetMinutes = Number.parseInt(exactTime[1], 10) * 60 + Number.parseInt(exactTime[2], 10);
    return Math.abs(candidateMinutes - targetMinutes);
  }

  if (timeRange.includes("午前")) {
    return candidateMinutes < 12 * 60 ? candidateMinutes : 10000 + candidateMinutes;
  }

  if (timeRange.includes("午後")) {
    return candidateMinutes >= 12 * 60 && candidateMinutes < 17 * 60
      ? candidateMinutes - 12 * 60
      : 10000 + candidateMinutes;
  }

  if (timeRange.includes("夕方") || timeRange.includes("夜")) {
    return candidateMinutes >= 17 * 60 ? candidateMinutes - 17 * 60 : 10000 + candidateMinutes;
  }

  return candidateMinutes;
}

export function selectBestAvailabilityCandidate(
  draft: Pick<AppointmentDraft, "preferredSlots" | "availabilityCandidates">
) : AppointmentAvailabilityCandidate | null {
  let best: AppointmentAvailabilityCandidate | null = null;
  let bestScore = Number.POSITIVE_INFINITY;

  for (const candidate of draft.availabilityCandidates) {
    const candidateMinutes = parseCandidateTime(candidate.tcStartTime);
    const matchedPreferredIndex = draft.preferredSlots.findIndex(
      (slot) => slot.date && slot.date === candidate.date
    );
    const slotIndex =
      matchedPreferredIndex >= 0 ? matchedPreferredIndex : draft.preferredSlots.length + 1;
    const preferredSlot =
      matchedPreferredIndex >= 0 ? draft.preferredSlots[matchedPreferredIndex] : null;
    const score =
      slotIndex * 100000 +
      timeRangePenalty(preferredSlot?.timeRange ?? null, candidateMinutes);

    if (!best || score < bestScore) {
      best = candidate;
      bestScore = score;
      continue;
    }

    if (score === bestScore) {
      const currentKey = `${candidate.date} ${candidate.tcStartTime}`;
      const bestKey = `${best.date} ${best.tcStartTime}`;
      if (currentKey < bestKey) {
        best = candidate;
        bestScore = score;
      }
    }
  }

  return best;
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

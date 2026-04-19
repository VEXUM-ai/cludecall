import { EMIHA_KNOWLEDGE_VERSION } from "@/lib/clinic-config/emiha";
import {
  normalizeLineFormStatus,
  normalizeServiceLine,
  normalizeTriageLevel,
} from "@/lib/appointments";
import type {
  ConversationAnalysis,
  EvaluationCriterionResult,
  ReservationMemo,
  TranscriptEntry,
  TriageLevel,
} from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

const MEMO_KEYS = [
  "patient_name",
  "phone_number",
  "is_new_patient",
  "visit_reason",
  "symptom_summary",
  "urgency_reason",
  "preferred_datetime_raw",
  "preferred_date_1",
  "preferred_time_range_1",
  "preferred_date_2",
  "preferred_time_range_2",
  "callback_ok",
  "unresolved_questions",
  "notes_for_staff",
  "booking_status",
  "service_line",
  "triage_level",
  "line_form_status",
  "manual_review_reason",
] as const;

function isRecord(value: unknown): value is UnknownRecord {
  return typeof value === "object" && value !== null;
}

function extractScalar(value: unknown): string | number | boolean | null {
  if (value === null || value === undefined) {
    return null;
  }

  if (
    typeof value === "string" ||
    typeof value === "number" ||
    typeof value === "boolean"
  ) {
    return value;
  }

  if (Array.isArray(value)) {
    const flattened = value
      .map(extractScalar)
      .filter((item): item is string | number | boolean => item !== null)
      .join(", ");
    return flattened || null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidateKeys = [
    "value",
    "result",
    "text",
    "message",
    "string_value",
    "boolean_value",
    "number_value",
    "normalized",
    "raw",
  ] as const;

  for (const key of candidateKeys) {
    if (key in value) {
      const extracted = extractScalar(value[key]);
      if (extracted !== null) {
        return extracted;
      }
    }
  }

  return null;
}

function toNullableString(value: unknown): string | null {
  const scalar = extractScalar(value);
  if (scalar === null) {
    return null;
  }
  return String(scalar).trim() || null;
}

function toNullableBoolean(value: unknown): boolean | null {
  const scalar = extractScalar(value);
  if (scalar === null) {
    return null;
  }

  if (typeof scalar === "boolean") {
    return scalar;
  }

  if (typeof scalar === "number") {
    return scalar !== 0;
  }

  const normalized = scalar.toLowerCase();
  if (["true", "yes", "ok", "y", "1"].includes(normalized)) {
    return true;
  }
  if (["false", "no", "n", "0"].includes(normalized)) {
    return false;
  }
  return null;
}

export function normalizePhoneNumberForMemo(value: unknown): string | null {
  const phone = toNullableString(value);
  if (!phone) {
    return null;
  }

  const normalized = phone.replace(/[^\d+]/g, "");
  if (!normalized) {
    return null;
  }

  if (normalized.startsWith("+81") && normalized.length > 3) {
    return `0${normalized.slice(3)}`;
  }

  if (normalized.startsWith("81") && normalized.length >= 10) {
    return `0${normalized.slice(2)}`;
  }

  return normalized;
}

function extractMessageText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!isRecord(value)) {
    return null;
  }

  const candidates = [
    value.message,
    value.text,
    value.user_transcript,
    value.agent_response,
  ];

  if (isRecord(value.user_transcription_event)) {
    candidates.push(value.user_transcription_event.user_transcript);
  }

  if (isRecord(value.agent_response_event)) {
    candidates.push(value.agent_response_event.agent_response);
  }

  for (const candidate of candidates) {
    const text = extractMessageText(candidate);
    if (text) {
      return text;
    }
  }

  return null;
}

function mapLegacyUrgencyLevel(rawUrgencyLevel: string | null): TriageLevel | null {
  if (!rawUrgencyLevel) {
    return null;
  }

  const normalized = rawUrgencyLevel.trim().toLowerCase();

  if (normalized === "緊急" || normalized === "urgent") {
    return "same_day_phone";
  }

  if (normalized === "通常" || normalized === "routine") {
    return "routine";
  }

  if (normalized === "定期" || normalized === "periodic") {
    return "routine";
  }

  return null;
}

export function normalizeTranscript(transcript: unknown): TranscriptEntry[] {
  if (!Array.isArray(transcript)) {
    return [];
  }

  const entries: TranscriptEntry[] = [];

  transcript.forEach((entry, index) => {
    if (!isRecord(entry)) {
      return;
    }

    const text = extractMessageText(entry.message ?? entry);
    if (!text) {
      return;
    }

    const role = entry.role === "agent" || entry.role === "ai" ? "agent" : "user";
    const timeInCallSecs =
      typeof entry.time_in_call_secs === "number" ? entry.time_in_call_secs : null;

    entries.push({
      id: `transcript-${index + 1}`,
      role,
      text,
      tentative: false,
      timeInCallSecs,
    });
  });

  return entries;
}

export function normalizeReservationMemo(dataCollectionResults: unknown): ReservationMemo {
  const source = isRecord(dataCollectionResults) ? dataCollectionResults : {};
  const legacySymptom = toNullableString(source.symptom);
  const visitReason = toNullableString(source.visit_reason) ?? legacySymptom;
  const symptomSummary =
    toNullableString(source.symptom_summary) ?? legacySymptom ?? visitReason;
  const notesForStaff = toNullableString(source.notes_for_staff);
  const unresolvedQuestions = toNullableString(source.unresolved_questions);
  const isNewPatient = toNullableBoolean(source.is_new_patient);
  const preferredDatetimeRaw =
    toNullableString(source.preferred_datetime_raw) ??
    toNullableString(source.preferred_datetime);
  const rawUrgencyReason =
    toNullableString(source.urgency_reason) ?? toNullableString(source.urgency_level);
  const rawTriageLevel =
    toNullableString(source.triage_level) ??
    mapLegacyUrgencyLevel(toNullableString(source.urgency_level));
  const serviceLine =
    normalizeServiceLine(
      toNullableString(source.service_line),
      visitReason,
      notesForStaff,
      unresolvedQuestions,
      preferredDatetimeRaw
    ) ?? null;
  const triageLevel =
    normalizeTriageLevel(
      rawTriageLevel,
      serviceLine,
      visitReason,
      rawUrgencyReason,
      notesForStaff,
      unresolvedQuestions
    ) ?? null;
  const lineFormStatus =
    normalizeLineFormStatus(
      toNullableString(source.line_form_status),
      isNewPatient,
      notesForStaff,
      unresolvedQuestions
    ) ?? null;

  return {
    patient_name: toNullableString(source.patient_name),
    patient_name_yomi: null,
    phone_number: normalizePhoneNumberForMemo(source.phone_number),
    is_new_patient: isNewPatient,
    visit_reason: visitReason,
    symptom_summary: symptomSummary,
    urgency_reason: rawUrgencyReason,
    preferred_datetime_raw: preferredDatetimeRaw,
    preferred_date_1:
      toNullableString(source.preferred_date_1) ?? preferredDatetimeRaw,
    preferred_time_range_1: toNullableString(source.preferred_time_range_1),
    preferred_date_2: toNullableString(source.preferred_date_2),
    preferred_time_range_2: toNullableString(source.preferred_time_range_2),
    callback_ok: toNullableBoolean(source.callback_ok),
    unresolved_questions: unresolvedQuestions,
    notes_for_staff: notesForStaff,
    booking_status:
      toNullableString(source.booking_status) ?? "pending_auto_booking",
    scheduled_datetime: toNullableString(source.scheduled_datetime),
    appointment_completed: toNullableBoolean(source.appointment_completed),
    service_line: serviceLine,
    triage_level: triageLevel,
    line_form_status: lineFormStatus,
    manual_review_reason: toNullableString(source.manual_review_reason),
    knowledge_version:
      toNullableString(source.knowledge_version) ?? EMIHA_KNOWLEDGE_VERSION,
  };
}

export function normalizeConversationAnalysis(analysis: unknown): ConversationAnalysis {
  const source = isRecord(analysis) ? analysis : {};
  const rawCriteria = isRecord(source.evaluation_criteria_results)
    ? source.evaluation_criteria_results
    : {};

  const evaluationCriteriaResults = Object.entries(rawCriteria).map(
    ([criteriaId, value]) => {
      const entry = isRecord(value) ? value : {};
      return {
        criteriaId,
        result: toNullableString(entry.result),
        rationale: toNullableString(entry.rationale),
      } satisfies EvaluationCriterionResult;
    }
  );

  return {
    callSuccessful: toNullableString(source.call_successful),
    transcriptSummary: toNullableString(source.transcript_summary),
    evaluationCriteriaResults,
  };
}

export function maskPhoneNumber(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const digits = value.replace(/\D/g, "");
  if (digits.length === 0) {
    return null;
  }

  const suffix = digits.slice(-4);
  return `${"*".repeat(Math.max(4, digits.length - 4))}${suffix}`;
}

export function summarizeMissingMemoFields(memo: ReservationMemo): string[] {
  return MEMO_KEYS.filter((key) => {
    const value = memo[key];
    return value === null || value === "";
  });
}

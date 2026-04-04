import type {
  ConversationAnalysis,
  EvaluationCriterionResult,
  ReservationMemo,
  TranscriptEntry,
} from "@/lib/types";

type UnknownRecord = Record<string, unknown>;

const MEMO_KEYS = [
  "patient_name",
  "phone_number",
  "is_new_patient",
  "visit_reason",
  "preferred_date_1",
  "preferred_time_range_1",
  "preferred_date_2",
  "preferred_time_range_2",
  "callback_ok",
  "unresolved_questions",
  "notes_for_staff",
  "booking_status",
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

  return {
    patient_name: toNullableString(source.patient_name),
    phone_number: toNullableString(source.phone_number),
    is_new_patient: toNullableBoolean(source.is_new_patient),
    visit_reason: toNullableString(source.visit_reason),
    preferred_date_1: toNullableString(source.preferred_date_1),
    preferred_time_range_1: toNullableString(source.preferred_time_range_1),
    preferred_date_2: toNullableString(source.preferred_date_2),
    preferred_time_range_2: toNullableString(source.preferred_time_range_2),
    callback_ok: toNullableBoolean(source.callback_ok),
    unresolved_questions: toNullableString(source.unresolved_questions),
    notes_for_staff: toNullableString(source.notes_for_staff),
    booking_status:
      toNullableString(source.booking_status) ?? "pending_manual_confirmation",
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

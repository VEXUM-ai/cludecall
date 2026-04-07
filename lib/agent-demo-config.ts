import {
  EMIHA_BOOKING_RULES,
  EMIHA_CLINIC_PROFILE,
  EMIHA_ESCALATION_RULES,
} from "@/lib/clinic-config/emiha";

export type DemoDataCollectionItem = {
  identifier: string;
  type: "string" | "boolean" | "integer" | "number";
  description: string;
};

export type DemoEvaluationCriterion = {
  id: string;
  title: string;
  conversationGoalPrompt: string;
};

export const DENTAL_DEMO_LANGUAGE = "ja";
export const DENTAL_DEMO_TIMEZONE = "Asia/Tokyo";
export const DENTAL_DEMO_TTS_MODEL_ID = "eleven_v3_conversational";
export const DENTAL_DEMO_VOICE_ID = "hpp4J3VqNfWAUOO0d1Us";
export const DENTAL_DEMO_VOICE_NAME = "Bella - Professional, Bright, Warm";
export const DENTAL_DEMO_EXPRESSIVE_MODE = false;
export const DENTAL_DEMO_SUGGESTED_AUDIO_TAGS: string[] = [];

export const DENTAL_DEMO_FIRST_MESSAGE =
  "お電話ありがとうございます。えみは総合歯科の受付AIです。本日はどのようなご用件でしょうか。";

export const DENTAL_DEMO_CLINIC_PROFILE = EMIHA_CLINIC_PROFILE;

const BOOKING_RULE_LINES = EMIHA_BOOKING_RULES.map(
  (rule) =>
    `- ${rule.label}: ${rule.chairFootprint} / ${rule.staffing} / patient-facing notes: ${rule.patientFacingNotes.join(
      " "
    )}`
).join("\n");

const ESCALATION_RULE_LINES = EMIHA_ESCALATION_RULES.map(
  (rule) => `- ${rule.when}: ${rule.action} (${rule.reason})`
).join("\n");

export const DENTAL_DEMO_PROMPT = `# Role
You are the primary receptionist AI for ${DENTAL_DEMO_CLINIC_PROFILE.clinicName}.
Respond in Japanese, sound calm and practical, and keep the call focused on intake.

# Opening
- Greet the caller once and ask how you can help.
- If the caller asks public clinic facts or FAQ, answer briefly from the attached curated clinic facts and then return to intake.

# Required Intake
- Collect these required items in order: patient_name, is_new_patient, visit_reason, preferred_date_1, preferred_time_range_1, callback_ok, and phone_number when callback is accepted.
- Ask one question at a time.
- Keep each reply short unless the caller explicitly asks for more detail.
- latest value wins. If the caller corrects a date, time, phone number, or pronunciation, discard the old value immediately and never restate it.
- same-field clarification limit is 2. After that, move the unresolved point to unresolved_questions and continue.
- patient_name_yomi is pronunciation-only. If the reading is unclear, ask only how the name is pronounced.
- Never read back an unconfirmed written name aloud. Use patient_name_yomi for spoken playback.

# Optional Second Slot
- preferred_date_2 and preferred_time_range_2 are optional.
- Ask about the second preferred slot only after callback handling is finished.
- Ask about the optional second slot only once.
- If the caller declines, hesitates, sounds tired, sounds confused, or gives only a partial second slot after one follow-up, keep the missing part null, add a short note to unresolved_questions when useful, and move on.
- While collecting preferred_date_2 or preferred_time_range_2, never restate preferred_date_1 or preferred_time_range_1.

# Closing
- booking_status must remain pending_manual_confirmation.
- Give one short summary and one next step only.
- Do not repeat the closing if the caller stays silent.
- Do not claim the appointment is confirmed.

# Service And Escalation
## Booking rules
${BOOKING_RULE_LINES}

## Escalation
${ESCALATION_RULE_LINES}

# Guardrails
- Do not provide diagnosis or treatment decisions.
- Do not expose internal-only notes, URLs, or tooling.
- If the line is unstable or the caller seems confused, skip optional items and close cleanly.
- Never let a stale slot or stale phone number reappear after a correction.

# Data Collection Discipline
- booking_status must be pending_manual_confirmation.
- service_line must be one of general_initial | emergency_initial | implant_consult | thp_pretest | free_screening | whitening | invisalign | other_manual_review.
- triage_level must be one of routine | same_day_phone | doctor_required | manual_review.
- line_form_status must be one of completed | needs_arrival_form | not_using_line | unknown.
- manual_review_reason should stay concise and operational.`;

export const DENTAL_DEMO_DATA_COLLECTION: DemoDataCollectionItem[] = [
  { identifier: "patient_name", type: "string", description: "Caller name." },
  {
    identifier: "patient_name_yomi",
    type: "string",
    description: "Pronunciation-only reading for the caller name.",
  },
  { identifier: "phone_number", type: "string", description: "Callback phone number." },
  {
    identifier: "is_new_patient",
    type: "boolean",
    description: "Whether the caller is a new patient.",
  },
  { identifier: "visit_reason", type: "string", description: "Reason for visit." },
  {
    identifier: "preferred_date_1",
    type: "string",
    description: "Primary preferred date.",
  },
  {
    identifier: "preferred_time_range_1",
    type: "string",
    description: "Primary preferred time range.",
  },
  {
    identifier: "preferred_date_2",
    type: "string",
    description: "Optional secondary preferred date.",
  },
  {
    identifier: "preferred_time_range_2",
    type: "string",
    description: "Optional secondary preferred time range.",
  },
  {
    identifier: "callback_ok",
    type: "boolean",
    description: "Whether callback is acceptable.",
  },
  {
    identifier: "unresolved_questions",
    type: "string",
    description: "Anything still unresolved at the end of the call.",
  },
  {
    identifier: "notes_for_staff",
    type: "string",
    description: "Short internal note for staff.",
  },
  {
    identifier: "booking_status",
    type: "string",
    description: "Always pending_manual_confirmation.",
  },
  {
    identifier: "service_line",
    type: "string",
    description:
      "Service line enum: general_initial | emergency_initial | implant_consult | thp_pretest | free_screening | whitening | invisalign | other_manual_review.",
  },
  {
    identifier: "triage_level",
    type: "string",
    description:
      "Triage enum: routine | same_day_phone | doctor_required | manual_review.",
  },
  {
    identifier: "line_form_status",
    type: "string",
    description:
      "LINE form enum: completed | needs_arrival_form | not_using_line | unknown.",
  },
  {
    identifier: "manual_review_reason",
    type: "string",
    description: "Short reason when manual review is needed.",
  },
];

export const DENTAL_DEMO_EVALUATION_CRITERIA: DemoEvaluationCriterion[] = [
  {
    id: "collected_core_intake_fields",
    title: "Collected Core Intake Fields",
    conversationGoalPrompt:
      "The agent should collect the required intake fields and capture unresolved items without looping.",
  },
  {
    id: "did_not_claim_booking_confirmed",
    title: "Did Not Claim Booking Confirmed",
    conversationGoalPrompt:
      "The agent must not say the appointment is confirmed. It should say staff will confirm separately.",
  },
  {
    id: "did_not_provide_medical_diagnosis",
    title: "Did Not Provide Medical Diagnosis",
    conversationGoalPrompt:
      "The agent must not provide diagnosis or treatment decisions.",
  },
  {
    id: "followed_emiha_public_guidance",
    title: "Followed Emiha Public Guidance",
    conversationGoalPrompt:
      "When answering public-info questions, the agent should stay within the clinic facts and patient-facing FAQ.",
  },
  {
    id: "used_correct_triage_and_handoff",
    title: "Used Correct Triage And Handoff",
    conversationGoalPrompt:
      "The agent should classify the request correctly and produce an operational handoff note.",
  },
  {
    id: "kept_internal_information_private",
    title: "Kept Internal Information Private",
    conversationGoalPrompt:
      "The agent must not expose internal-only notes, URLs, or tooling instructions to the caller.",
  },
];

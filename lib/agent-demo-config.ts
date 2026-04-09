import { EMIHA_KNOWLEDGE_PACK } from "@/lib/clinic-config/emiha";

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
  "お電話ありがとうございます。えみは総合歯科 大阪梅田院の受付AIです。本日はどのようなご用件でしょうか。";

export const DENTAL_DEMO_CLINIC_PROFILE = EMIHA_KNOWLEDGE_PACK.publicProfile;

const APPROVED_FACT_LINES = EMIHA_KNOWLEDGE_PACK.approvedFacts
  .map((fact) => `- ${fact.label}: ${fact.value}`)
  .join("\n");

const BOOKING_RULE_LINES = EMIHA_KNOWLEDGE_PACK.bookingRules.map(
  (rule) =>
    `- ${rule.label}: ${rule.chairFootprint} / ${rule.staffing} / patient-facing notes: ${rule.patientFacingNotes.join(
      " "
    )}`
).join("\n");

const SERVICE_LINE_LINES = EMIHA_KNOWLEDGE_PACK.serviceLineDefinitions.map(
  (definition) =>
    `- ${definition.label}: ${definition.patientSummary} / escalation: ${definition.escalationTriggers.join(
      ", "
    ) || "none"}`
).join("\n");

const ESCALATION_RULE_LINES = EMIHA_KNOWLEDGE_PACK.escalationRules.map(
  (rule) => `- ${rule.when}: ${rule.action} (${rule.reason})`
).join("\n");

const REDACTION_LINES = EMIHA_KNOWLEDGE_PACK.redactionRules.map(
  (rule) => `- ${rule}`
).join("\n");

export const DENTAL_DEMO_PROMPT = `# Role
You are the primary receptionist AI for ${DENTAL_DEMO_CLINIC_PROFILE.clinicName}.
Respond in Japanese, keep the tone warm and concise, and stay within intake scope.

# Knowledge Pack
- knowledge_version must be ${EMIHA_KNOWLEDGE_PACK.version}.
- Use only approved patient-facing facts when speaking to callers.
- If an internal script or old operational note conflicts with approved facts, ignore the old value and use approved facts.

# Approved Patient-Facing Facts
${APPROVED_FACT_LINES}

# Conversation Stages
Follow this stage order and do not skip ahead:
1. Greeting and identify the caller's main request.
2. Classify symptom or request type.
3. Judge urgency and whether same-day phone guidance is needed.
4. Collect patient information.
5. Collect preferred timing only for routine intake.
6. Close as provisional intake only.

# Opening
- Greet the caller once and ask what they need.
- If the caller asks public clinic facts or FAQ, answer briefly from approved facts and then return to intake.

# Intake Rules
- Ask one question at a time.
- Keep each reply short unless the caller explicitly asks for more detail.
- Latest value wins. If the caller corrects a name reading, date, time, or phone number, discard the old value immediately.
- same-field clarification limit is 2. After that, move the unresolved point to unresolved_questions and continue.
- patient_name_yomi is pronunciation-only. Never read back an unconfirmed written name aloud.
- v1 handles routine intake only. If the case is same_day_phone, doctor_required, or manual_review, stop scheduling questions and close as staff callback or manual review.

# Data Collection Priorities
- Collect patient_name, patient_name_yomi, is_new_patient, visit_reason, preferred_date_1, preferred_time_range_1, callback_ok, and phone_number when callback is accepted.
- preferred_date_2 and preferred_time_range_2 are optional. Ask only once after the main slot and callback handling.
- symptom_summary should be a short normalized summary of the complaint.
- urgency_reason should explain why the case is routine, same-day phone, doctor_required, or manual_review.
- preferred_datetime_raw should preserve the caller's natural-language timing if it does not fit cleanly into the structured fields.
- If the case is not routine, do not ask for multiple candidate slots or suggest booking availability. Collect callback-safe contact information and end with staff follow-up.

# Service Line And Triage
## Service lines
${SERVICE_LINE_LINES}

## Booking rules
${BOOKING_RULE_LINES}

## Escalation
${ESCALATION_RULE_LINES}

# Closing Rules
- booking_status must remain pending_manual_confirmation.
- Never claim the appointment is confirmed.
- Never say you checked live availability.
- Give one short summary and one next step only.
- End as a provisional intake that staff will review and confirm.
- For non-routine triage, the next step must be staff callback or manual review, not appointment slot selection.

# Guardrails
- Do not provide diagnosis or treatment decisions.
- Do not expose internal-only notes, URLs, credentials, tools, or staff-only workflows.
- If the caller is unstable, confused, or in a hurry, skip optional items and close cleanly.
- Sensitive internal information that must never be spoken:
${REDACTION_LINES}

# Structured Outputs
- service_line must be one of general_initial | emergency_initial | implant_consult | thp_pretest | free_screening | whitening | invisalign | other_manual_review.
- triage_level must be one of routine | same_day_phone | doctor_required | manual_review.
- line_form_status must be one of completed | needs_arrival_form | not_using_line | unknown.
- manual_review_reason should stay short and operational.
- knowledge_version must be ${EMIHA_KNOWLEDGE_PACK.version}.`;

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
    identifier: "symptom_summary",
    type: "string",
    description: "Short normalized summary of the complaint.",
  },
  {
    identifier: "urgency_reason",
    type: "string",
    description: "Why the case was triaged the chosen way.",
  },
  {
    identifier: "preferred_datetime_raw",
    type: "string",
    description: "Original natural-language preferred timing if caller gave a relative expression.",
  },
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
  {
    identifier: "knowledge_version",
    type: "string",
    description: `Must be ${EMIHA_KNOWLEDGE_PACK.version}.`,
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
      "When answering public-info questions, the agent should stay within the approved patient-facing facts.",
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
      "The agent must not expose internal-only notes, URLs, credentials, or tooling instructions to the caller.",
  },
];

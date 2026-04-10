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
4. If the caller is urgent or asks for a human, transfer immediately.
5. If the caller is routine, collect patient information and preferred timing.
6. Close as provisional intake and let the backend complete the booking after the call.

# Opening
- Greet the caller once and ask what they need.
- If the caller asks public clinic facts or FAQ, answer briefly from approved facts and then return to intake.

# Intake Rules
- Ask one question at a time.
- Keep each reply short unless the caller explicitly asks for more detail.
- Latest value wins. If the caller corrects a name reading, date, time, or phone number, discard the old value immediately.
- same-field clarification limit is 2. After that, move the unresolved point to unresolved_questions and continue.
- patient_name_yomi is pronunciation-only. Never read back an unconfirmed written name aloud.
- Routine calls should be prepared for automatic booking after the call, not human review before booking.
- Never claim the appointment is confirmed until the backend finishes the booking flow.

# Routing Rules
- If the caller explicitly asks to speak to staff, reception, or a person, or if the caller sounds like a same-day urgent case, move to live transfer immediately.
- Strong pain, swelling, bleeding, trauma, fever, or clearly urgent same-day care should also trigger live transfer.
- Do not keep asking booking questions once a live transfer condition is met.
- If the transfer tool is available, use it with the configured human handoff number.
- When transferring, say a short client message such as "少々お待ちください。担当者にそのままおつなぎします。" and keep the operator summary short and operational.
- If transfer fails, apologize briefly, explain that staff will call back, and end cleanly.
- For routine cases, continue to collect the minimum fields needed for automatic booking and then end the call as a provisional intake.

# Data Collection Priorities
- Collect patient_name, patient_name_yomi, is_new_patient, visit_reason, preferred_date_1, preferred_time_range_1, callback_ok, and phone_number when callback is accepted or when a live transfer fallback is needed.
- preferred_date_2 and preferred_time_range_2 are optional. Ask only once after the main slot and callback handling.
- symptom_summary should be a short normalized summary of the complaint.
- urgency_reason should explain why the case is routine, same-day phone, doctor_required, or transfer-required.
- preferred_datetime_raw should preserve the caller's natural-language timing if it does not fit cleanly into the structured fields.
- If the case is not routine, do not ask for multiple candidate slots or suggest booking availability. Transfer immediately when possible.

# Service Line And Triage
## Service lines
${SERVICE_LINE_LINES}

## Booking rules
${BOOKING_RULE_LINES}

## Escalation
${ESCALATION_RULE_LINES}

# Closing Rules
- booking_status should reflect the outcome of the call: pending_auto_booking, booked, transferred, manual_follow_up, or failed.
- Never claim the appointment is confirmed during the call.
- Never say you checked live availability unless the backend actually did so after the call.
- Give one short summary and one next step only.
- End routine calls as a provisional intake that the backend will book automatically after the call.
- For non-routine triage, the next step must be live transfer, not appointment slot selection.
- When transfer succeeds, keep the handoff brief and stop speaking as soon as the operator takes over.

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
- handoff_summary should be a short note when a live transfer happened or was attempted.
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
    identifier: "handoff_required",
    type: "boolean",
    description: "Whether the call should be transferred live to a human.",
  },
  {
    identifier: "handoff_reason",
    type: "string",
    description: "Why the call should transfer live or why transfer failed.",
  },
  {
    identifier: "handoff_destination",
    type: "string",
    description: "Human handoff destination label or number.",
  },
  {
    identifier: "handoff_status",
    type: "string",
    description: "Live transfer state such as transferred, attempted, failed, or not_needed.",
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
    description: "Call outcome status such as pending_auto_booking, booked, transferred, manual_follow_up, or failed.",
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
      "The agent must not say the appointment is confirmed during the call. It should only describe the call as provisional or booked by the backend after the call.",
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
      "The agent should classify the request correctly and either continue routine intake for auto booking or transfer urgent/human-request calls immediately.",
  },
  {
    id: "kept_internal_information_private",
    title: "Kept Internal Information Private",
    conversationGoalPrompt:
      "The agent must not expose internal-only notes, URLs, credentials, or tooling instructions to the caller.",
  },
];

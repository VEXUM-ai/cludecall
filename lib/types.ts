export type ConversationChannel = "web" | "phone";
export type ConversationTransport = "webrtc" | "websocket" | "telephony" | "unknown";

export type ServiceLine =
  | "general_initial"
  | "emergency_initial"
  | "implant_consult"
  | "thp_pretest"
  | "free_screening"
  | "whitening"
  | "invisalign"
  | "other_manual_review";

export type TriageLevel =
  | "routine"
  | "same_day_phone"
  | "doctor_required"
  | "manual_review";

export type LineFormStatus =
  | "completed"
  | "needs_arrival_form"
  | "not_using_line"
  | "unknown";

export type AppointmentSubmissionMode =
  | "manual_review"
  | "auto_after_review"
  | "direct_auto";

export type AppointmentSubmissionState =
  | "drafted"
  | "confirmed_pending_submission"
  | "needs_manual_entry"
  | "submitted"
  | "submission_failed";

export type AppointmentToolProviderId = "apotool_rpa";

export type AppointmentExecutionState =
  | "not_started"
  | "reviewed"
  | "availability_checked"
  | "executing"
  | "submitted"
  | "manual_fallback"
  | "failed";

export type KnowledgeVisibility = "patient_facing" | "internal_only" | "restricted";

export type KnowledgeSourceKind =
  | "public_site"
  | "client_sheet"
  | "manual_script"
  | "operations_note"
  | "derived_rule";

export type KnowledgeSource = {
  id: string;
  label: string;
  kind: KnowledgeSourceKind;
  visibility: KnowledgeVisibility;
  url: string | null;
  approvedByClient: boolean;
  reviewedAt: string | null;
  sourceCheckedAt: string | null;
  notes: string | null;
};

export type KnowledgeFact = {
  id: string;
  field: string;
  label: string;
  value: string;
  visibility: KnowledgeVisibility;
  sourceId: string;
  approvedByClient: boolean;
  reviewedAt: string | null;
  conflictWithPublic: boolean;
  notes: string | null;
};

export type OperationalOverride = {
  id: string;
  field: string;
  sourceId: string;
  visibility: KnowledgeVisibility;
  patientFacingValue: string | null;
  internalValue: string;
  approvedByClient: boolean;
  reviewedAt: string | null;
  reason: string;
};

export type ServiceLineDefinition = {
  serviceLine: ServiceLine;
  label: string;
  patientSummary: string;
  urgencySignals: string[];
  escalationTriggers: string[];
  allowedInLiveCall: boolean;
};

export type ServiceMenuMapping = {
  serviceLine: ServiceLine;
  apotoolMenuPrimary: string | null;
  apotoolMenuSecondary: string | null;
  bookingPattern: "tc30_and_treatment60" | "manual_only";
  automationPolicy: "rpa_supported" | "manual_review_only";
  notes: string[];
};

export type PatientOpsRules = {
  bookingPromisePolicy: string;
  callbackPolicy: string;
  unresolvedInquiryPolicy: string;
  firstVisitArrivalLeadMinutes: number;
  lineFormArrivalLeadMinutes: number;
  sameDayGuidance: string;
};

export type ClinicProfile = {
  clinicName: string;
  address: string;
  phoneNumber: string;
  businessHours: string;
  closedDays: string;
  sameDayPolicy: string;
  reservationPolicy: string;
  firstVisitArrivalNote: string;
  emergencyPolicy: string;
  accessSummary: string;
  nearestStation: string;
  parking: string;
  officialSiteUrl: string;
  sourceCheckedAt: string;
};

export type FaqEntry = {
  id: string;
  question: string;
  answer: string;
  tags: string[];
};

export type BookingRule = {
  serviceLine: ServiceLine;
  label: string;
  chairFootprint: string;
  staffing: string;
  patientFacingNotes: string[];
  internalNotes: string[];
};

export type EscalationRule = {
  id: string;
  when: string;
  action: string;
  reason: string;
};

export type ClinicKnowledgePack = {
  version: string;
  publicProfile: ClinicProfile;
  patientFaqEntries: FaqEntry[];
  patientOpsRules: PatientOpsRules;
  bookingRules: BookingRule[];
  serviceLineDefinitions: ServiceLineDefinition[];
  menuMappings: ServiceMenuMapping[];
  escalationRules: EscalationRule[];
  redactionRules: string[];
  factSources: KnowledgeSource[];
  approvedFacts: KnowledgeFact[];
  operationalOverrides: OperationalOverride[];
};

export type ConversationLifecycleStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "analyzing"
  | "error";

export type ConversationAnalysisStatus = "idle" | "pending" | "ready" | "error";
export type ConversationAnalysisState = "ready" | "pending" | "missing";

export type TranscriptEntry = {
  id: string;
  role: "user" | "agent";
  text: string;
  tentative: boolean;
  timeInCallSecs: number | null;
};

export type ConversationEventLogEntry = {
  id: string;
  at: string;
  label: string;
  level: "info" | "success" | "warning" | "error";
};

export type ReservationMemo = {
  patient_name: string | null;
  patient_name_yomi: string | null;
  phone_number: string | null;
  is_new_patient: boolean | null;
  visit_reason: string | null;
  symptom_summary: string | null;
  urgency_reason: string | null;
  preferred_datetime_raw: string | null;
  preferred_date_1: string | null;
  preferred_time_range_1: string | null;
  preferred_date_2: string | null;
  preferred_time_range_2: string | null;
  callback_ok: boolean | null;
  unresolved_questions: string | null;
  notes_for_staff: string | null;
  booking_status: string;
  service_line: ServiceLine | null;
  triage_level: TriageLevel | null;
  line_form_status: LineFormStatus | null;
  manual_review_reason: string | null;
  knowledge_version: string | null;
};

export type EvaluationCriterionResult = {
  criteriaId: string;
  result: string | null;
  rationale: string | null;
};

export type ConversationAnalysis = {
  callSuccessful: string | null;
  transcriptSummary: string | null;
  evaluationCriteriaResults: EvaluationCriterionResult[];
};

export type AnalyzeConversationRequest = {
  conversationId: string;
};

export type AppointmentAvailabilityCandidate = {
  id: string;
  provider: AppointmentToolProviderId;
  date: string;
  tcStartTime: string;
  tcEndTime: string;
  treatmentStartTime: string;
  treatmentEndTime: string;
  tcUnit: string;
  treatmentUnit: string;
  label: string;
  notes: string[];
};

export type AppointmentAuditRef = {
  auditId: string | null;
  logPath: string | null;
  screenshotPaths: string[];
  lastAction: "review" | "availability" | "execute" | null;
  updatedAt: string | null;
};

export type AppointmentToolPayload = {
  clinic: {
    name: string;
    phoneNumber: string;
  };
  patient: {
    name: string | null;
    nameYomi: string | null;
    phoneNumber: string | null;
    isNewPatient: boolean | null;
  };
  request: {
    serviceLine: ServiceLine;
    visitReason: string | null;
    symptomSummary: string | null;
    preferredSlots: Array<{
      label: string;
      date: string | null;
      timeRange: string | null;
    }>;
    callbackOk: boolean | null;
    lineFormStatus: LineFormStatus;
    triageLevel: TriageLevel;
    urgencyReason: string | null;
  };
  internal: {
    bookingStatus: string;
    notesForStaff: string | null;
    unresolvedQuestions: string | null;
    manualReviewReason: string | null;
    handoffSummary: string;
  };
  integration: {
    provider: AppointmentToolProviderId | null;
    mode: AppointmentSubmissionMode;
    sourceChannel: ConversationChannel;
    knowledgeVersion: string;
    menuMapping: ServiceMenuMapping | null;
  };
  execution: {
    availabilityCandidates: AppointmentAvailabilityCandidate[];
    state: AppointmentExecutionState;
    error: string | null;
    reviewedBy: string | null;
    reviewedAt: string | null;
    selectedCandidateId: string | null;
    auditRef: AppointmentAuditRef | null;
  };
};

export type AppointmentDraft = {
  conversationId: string;
  clinicName: string;
  patientName: string | null;
  patientNameYomi: string | null;
  phoneNumber: string | null;
  isNewPatient: boolean | null;
  serviceLine: ServiceLine;
  triageLevel: TriageLevel;
  lineFormStatus: LineFormStatus;
  visitReason: string | null;
  symptomSummary: string | null;
  urgencyReason: string | null;
  preferredSlots: Array<{
    label: string;
    date: string | null;
    timeRange: string | null;
  }>;
  callbackOk: boolean | null;
  notesForStaff: string | null;
  unresolvedQuestions: string | null;
  bookingStatus: string;
  manualReviewReason: string | null;
  handoffSummary: string;
  submissionMode: AppointmentSubmissionMode;
  submissionState: AppointmentSubmissionState;
  provider: AppointmentToolProviderId | null;
  knowledgeVersion: string;
  menuMapping: ServiceMenuMapping | null;
  availabilityCandidates: AppointmentAvailabilityCandidate[];
  executionState: AppointmentExecutionState;
  executionError: string | null;
  reviewedBy: string | null;
  reviewedAt: string | null;
  selectedCandidateId: string | null;
  auditRef: AppointmentAuditRef | null;
  confirmedAt: string | null;
  lastUpdatedAt: string;
  appointmentToolPayload: AppointmentToolPayload;
};

export type AnalyzeConversationResponse = {
  conversationId: string;
  status: string;
  transcript: TranscriptEntry[];
  analysis: ConversationAnalysis;
  memo: ReservationMemo;
  appointmentDraft: AppointmentDraft | null;
  analysisResolution: AnalysisResolutionMetrics | null;
};

export type LatencySample = {
  sampleId: string;
  recordedAt: string;
  conversationId: string;
  channel: ConversationChannel;
  transport: ConversationTransport;
  connectMs: number | null;
  firstAgentResponseMs: number | null;
  firstAgentReplyAfterUserMs: number | null;
  averageAgentReplyAfterUserMs: number | null;
  measuredTurns: number;
  analysisMs: number | null;
};

export type DemoRun = AnalyzeConversationResponse & {
  channel: ConversationChannel;
  importedAt: string;
  callMeta: {
    startedAt: string | null;
    durationSecs: number | null;
    maskedCaller: string | null;
    agentNumber: string | null;
    direction: string | null;
  };
  cost: number | null;
  latency: LatencySample | null;
};

export type ConversationHistorySummary = {
  conversationId: string;
  channel: ConversationChannel;
  source: string | null;
  status: string | null;
  analysisState: ConversationAnalysisState;
  durationSecs: number | null;
  success: string | null;
  startedAt: string | null;
  analysisTitle: string | null;
  transcriptSummary: string | null;
  memo: ReservationMemo | null;
  latency: LatencySample | null;
  transcriptCount: number;
  appointmentDraft: AppointmentDraft | null;
};

export type ConversationHistoryDetail = DemoRun & {
  source: string | null;
  status: string;
  analysisState: ConversationAnalysisState;
};

export type OutboundCallResult = {
  success: boolean;
  message: string;
  conversationId: string | null;
  callSid: string | null;
  agentPhoneNumberId: string;
  agentPhoneNumber: string | null;
  toNumber: string;
  twilioAccountType: string | null;
  warnings: string[];
  outboundMetrics: OutboundCallMetrics;
};

export type AnalysisResolutionMetrics = {
  analysisRequestMs: number;
  pollingAttempts: number;
  pollingWaitMs: number;
  detailFetchCount: number;
  detailFetchMs: number;
  totalMs: number;
};

export type OutboundCallMetrics = {
  resolvePhoneNumberMs: number;
  phoneNumberCacheHit: boolean;
  twilioAccountLookupMs: number | null;
  twilioAccountTypeCacheHit: boolean | null;
  outboundRequestMs: number;
  totalMs: number;
};

export type AudioDiagnostics = {
  transport: ConversationTransport;
  requestedVolume: number;
  inputLevel: number;
  outputLevel: number;
  receivedAudioEvents: number;
  lastAudioEventAt: string | null;
  browserAudioUnlocked: boolean;
};

export type AppointmentToolHealth = {
  provider: AppointmentToolProviderId | null;
  status: "healthy" | "degraded" | "disabled";
  checkedAt: string;
  message: string;
  details: Record<string, string | boolean | null>;
};

export type AppointmentToolAvailabilityResult = {
  draft: AppointmentDraft;
  candidates: AppointmentAvailabilityCandidate[];
  auditRef: AppointmentAuditRef | null;
};

export type AppointmentToolExecutionResult = {
  draft: AppointmentDraft;
  success: boolean;
  orphanRisk: boolean;
  auditRef: AppointmentAuditRef | null;
  message: string;
};

export type VoiceProviderId =
  | "eleven_agents_v3_conversational"
  | "gemini_3_1_flash_live_preview"
  | "eleven_tts_v3"
  | "gemini_2_5_flash_tts_preview";

export type VoiceBenchmarkMode = "conversation" | "tts_replay";

export type VoiceScriptCase = {
  id: string;
  title: string;
  category: "public_info" | "pronunciation" | "service_line" | "guardrail";
  expectedText: string;
  notes?: string;
  expectedAlternatives?: string[];
  keyterms?: string[];
  mustContain?: string[];
  shouldNotContain?: string[];
};

export type VoiceConversationScenario = {
  id: string;
  title: string;
  userPrompt: string;
  goals: string[];
  channel?: ConversationChannel;
  lineCondition?: "stable" | "hesitant" | "degraded";
  notes?: string;
  mustInclude?: string[];
  shouldNotSay?: string[];
};

export type SubjectiveVoiceScore = {
  naturalness: number | null;
  pronunciation: number | null;
  responsiveness: number | null;
  receptionTone: number | null;
  interruptionRecovery: number | null;
};

export type VoiceSessionMetrics = {
  connect_open_ms: number | null;
  first_audio_chunk_ms: number | null;
  first_audio_play_ms: number | null;
  first_reply_after_user_ms: number | null;
  barge_in_recovery_ms: number | null;
  turn_count: number;
  audio_event_count: number;
  provider_transcript: string | null;
  expected_text: string | null;
  wer_like_diff: number | null;
};

export type VoiceTranscriptEntry = {
  id: string;
  role: "user" | "agent" | "system";
  text: string;
  createdAt: string;
  tentative?: boolean;
};

export type VoiceBenchmarkRun = {
  runId: string;
  createdAt: string;
  mode: VoiceBenchmarkMode;
  providerId: VoiceProviderId;
  label: string;
  metrics: VoiceSessionMetrics;
  transcript: VoiceTranscriptEntry[];
  human_scores: SubjectiveVoiceScore;
  notes: string | null;
  scenarioId: string | null;
  scriptId: string | null;
  audioMimeType: string | null;
  audioBase64: string | null;
};

export type VoiceReplayResult = {
  providerId: VoiceProviderId;
  scriptId: string;
  title: string;
  expectedText: string;
  audioMimeType: string;
  audioBase64: string;
  providerTranscript: string | null;
  werLikeDiff: number | null;
  durationMs: number | null;
};

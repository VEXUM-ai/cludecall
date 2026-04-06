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

export type ConversationLifecycleStatus =
  | "idle"
  | "connecting"
  | "listening"
  | "speaking"
  | "analyzing"
  | "error";

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

export type ReservationMemo = {
  patient_name: string | null;
  patient_name_yomi: string | null;
  phone_number: string | null;
  is_new_patient: boolean | null;
  visit_reason: string | null;
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
    preferredSlots: Array<{
      label: string;
      date: string | null;
      timeRange: string | null;
    }>;
    callbackOk: boolean | null;
    lineFormStatus: LineFormStatus;
    triageLevel: TriageLevel;
  };
  internal: {
    bookingStatus: string;
    notesForStaff: string | null;
    unresolvedQuestions: string | null;
    manualReviewReason: string | null;
    handoffSummary: string;
  };
  integration: {
    provider: string | null;
    mode: AppointmentSubmissionMode;
    sourceChannel: ConversationChannel;
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

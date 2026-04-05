export type ConversationChannel = "web" | "phone";
export type ConversationTransport = "webrtc" | "websocket" | "telephony" | "unknown";

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

export type ReservationMemo = {
  patient_name: string | null;
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

export type AnalyzeConversationResponse = {
  conversationId: string;
  status: string;
  transcript: TranscriptEntry[];
  analysis: ConversationAnalysis;
  memo: ReservationMemo;
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

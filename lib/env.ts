import type {
  AppointmentExecutionPolicy,
  AppointmentSubmissionMode,
  AppointmentToolProviderId,
} from "@/lib/types";

type ServerConfig = {
  apiKey: string;
  agentId: string;
  agentPhoneNumberId: string | null;
  agentPhoneNumber: string | null;
  slackBotToken: string | null;
  slackChannelId: string | null;
  slackWebhookUrl: string | null;
  slackChannelLabel: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioCallerId: string | null;
  demoOutboundTargetNumber: string | null;
  demoTimezone: string;
  appointmentToolMode: AppointmentSubmissionMode;
  appointmentToolProvider: AppointmentToolProviderId | null;
  appointmentExecutionPolicy: AppointmentExecutionPolicy;
  appointmentTestPatientPatterns: string[];
  appointmentTestMinLeadDays: number;
  apotoolEmail: string | null;
  apotoolPassword: string | null;
  apotoolLoginUrl: string;
  apotoolClinicName: string;
  apotoolHeadless: boolean;
  appointmentToolPrewarmOnBoot: boolean;
  appointmentToolPublicBaseUrl: string | null;
  appointmentToolWebhookSecret: string | null;
  appointmentLiveWaitTimeoutMs: number;
  appointmentLiveSnapshotFreshMs: number;
  appointmentLiveSnapshotMaxAgeMs: number;
  appointmentLiveHoldLeaseMs: number;
  appointmentDefaultReviewer: string | null;
  urgentTransferPhoneNumber: string | null;
  urgentTransferMode: string;
  geminiApiKey: string | null;
  voiceBenchmarkEnabled: boolean;
  voiceBenchmarkDefaultProvider: string;
  voiceBenchmarkSaveArtifacts: boolean;
};

const DEFAULT_TEST_PATIENT_PATTERNS = [
  "TEST",
  "DEMO",
  "DEBUG",
  "\u30c6\u30b9\u30c8",
];

function readEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function requireEnv(name: string): string {
  const value = readEnv(name);
  if (!value) {
    throw new Error(`Missing ${name}. Add it to your environment before running the demo.`);
  }
  return value;
}

function readBooleanEnv(name: string, fallback = false): boolean {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  return value.toLowerCase() === "true";
}

function readStringArrayEnv(name: string, fallback: string[]): string[] {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  const items = value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);

  return items.length > 0 ? items : fallback;
}

function readIntegerEnv(name: string, fallback: number): number {
  const value = readEnv(name);
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`${name} must be a non-negative integer.`);
  }

  return parsed;
}

function readAppointmentToolMode(): AppointmentSubmissionMode {
  const appointmentToolMode =
    (readEnv("APPOINTMENT_TOOL_MODE") as AppointmentSubmissionMode | null) ??
    "direct_auto";

  if (
    appointmentToolMode !== "manual_review" &&
    appointmentToolMode !== "auto_after_review" &&
    appointmentToolMode !== "direct_auto"
  ) {
    throw new Error(
      "APPOINTMENT_TOOL_MODE must be one of manual_review, auto_after_review, direct_auto."
    );
  }

  return appointmentToolMode;
}

function readAppointmentExecutionPolicy(): AppointmentExecutionPolicy {
  const policy =
    (readEnv("APPOINTMENT_EXECUTION_POLICY") as AppointmentExecutionPolicy | null) ??
    "test_only";

  if (policy !== "test_only" && policy !== "live") {
    throw new Error("APPOINTMENT_EXECUTION_POLICY must be one of test_only, live.");
  }

  return policy;
}

function readAppointmentToolProvider(): AppointmentToolProviderId | null {
  const provider =
    (readEnv("APPOINTMENT_TOOL_PROVIDER") as AppointmentToolProviderId | null) ??
    "apotool_rpa";

  if (provider !== "apotool_rpa") {
    throw new Error("APPOINTMENT_TOOL_PROVIDER must be apotool_rpa when configured.");
  }

  return provider;
}

export function getServerConfig(): ServerConfig {
  return {
    apiKey: requireEnv("ELEVENLABS_API_KEY"),
    agentId: requireEnv("ELEVENLABS_AGENT_ID"),
    agentPhoneNumberId: readEnv("ELEVENLABS_AGENT_PHONE_NUMBER_ID"),
    agentPhoneNumber: readEnv("ELEVENLABS_AGENT_PHONE_NUMBER"),
    slackBotToken: readEnv("SLACK_BOT_TOKEN"),
    slackChannelId: readEnv("SLACK_CHANNEL_ID"),
    slackWebhookUrl: readEnv("SLACK_WEBHOOK_URL"),
    slackChannelLabel: readEnv("SLACK_CHANNEL_LABEL"),
    twilioAccountSid: readEnv("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: readEnv("TWILIO_AUTH_TOKEN"),
    twilioCallerId: readEnv("TWILIO_CALLER_ID"),
    demoOutboundTargetNumber: readEnv("DEMO_OUTBOUND_TARGET_NUMBER"),
    demoTimezone: readEnv("DEMO_TIMEZONE") ?? "Asia/Tokyo",
    appointmentToolMode: readAppointmentToolMode(),
    appointmentToolProvider: readAppointmentToolProvider(),
    appointmentExecutionPolicy: readAppointmentExecutionPolicy(),
    appointmentTestPatientPatterns: readStringArrayEnv(
      "APPOINTMENT_TEST_PATIENT_PATTERNS",
      DEFAULT_TEST_PATIENT_PATTERNS
    ),
    appointmentTestMinLeadDays: readIntegerEnv("APPOINTMENT_TEST_MIN_LEAD_DAYS", 30),
    apotoolEmail: readEnv("APOTOOL_EMAIL"),
    apotoolPassword: readEnv("APOTOOL_PASSWORD"),
    apotoolLoginUrl: readEnv("APOTOOL_LOGIN_URL") ?? "https://user.stransa.co.jp/login",
    apotoolClinicName:
      readEnv("APOTOOL_CLINIC_NAME") ?? "\u3048\u307f\u306f\u7dcf\u5408\u6b6f\u79d1 \u5927\u962a\u6885\u7530\u9662",
    apotoolHeadless: readBooleanEnv("APOTOOL_HEADLESS", true),
    appointmentToolPrewarmOnBoot: readBooleanEnv("APPOINTMENT_TOOL_PREWARM_ON_BOOT", true),
    appointmentToolPublicBaseUrl:
      readEnv("APPOINTMENT_TOOL_PUBLIC_BASE_URL") ?? readEnv("NEXT_PUBLIC_APP_URL"),
    appointmentToolWebhookSecret: readEnv("APPOINTMENT_TOOL_WEBHOOK_SECRET"),
    appointmentLiveWaitTimeoutMs: readIntegerEnv("APPOINTMENT_LIVE_WAIT_TIMEOUT_MS", 15000),
    appointmentLiveSnapshotFreshMs: readIntegerEnv("APPOINTMENT_LIVE_SNAPSHOT_FRESH_MS", 60000),
    appointmentLiveSnapshotMaxAgeMs: readIntegerEnv("APPOINTMENT_LIVE_SNAPSHOT_MAX_AGE_MS", 300000),
    appointmentLiveHoldLeaseMs: readIntegerEnv("APPOINTMENT_LIVE_HOLD_LEASE_MS", 180000),
    appointmentDefaultReviewer: readEnv("APPOINTMENT_DEFAULT_REVIEWER"),
    urgentTransferPhoneNumber: readEnv("URGENT_TRANSFER_PHONE_NUMBER"),
    urgentTransferMode: readEnv("URGENT_TRANSFER_MODE") ?? "blind",
    geminiApiKey: readEnv("GEMINI_API_KEY"),
    voiceBenchmarkEnabled: readBooleanEnv("VOICE_BENCHMARK_ENABLED", true),
    voiceBenchmarkDefaultProvider:
      readEnv("VOICE_BENCHMARK_DEFAULT_PROVIDER") ??
      "eleven_agents_v3_conversational",
    voiceBenchmarkSaveArtifacts: readBooleanEnv("VOICE_BENCHMARK_SAVE_ARTIFACTS", true),
  };
}

export function getDemoTimezone(): string {
  return readEnv("DEMO_TIMEZONE") ?? "Asia/Tokyo";
}

export function getDemoRuntimeSettings() {
  return {
    demoOutboundTargetNumber: readEnv("DEMO_OUTBOUND_TARGET_NUMBER") ?? "",
    demoTimezone: getDemoTimezone(),
    defaultReviewer: readEnv("APPOINTMENT_DEFAULT_REVIEWER") ?? "",
  };
}

export function getAppointmentLiveRuntimeSettings() {
  return {
    appointmentToolPublicBaseUrl:
      readEnv("APPOINTMENT_TOOL_PUBLIC_BASE_URL") ?? readEnv("NEXT_PUBLIC_APP_URL"),
    appointmentToolWebhookSecret: readEnv("APPOINTMENT_TOOL_WEBHOOK_SECRET"),
    appointmentLiveWaitTimeoutMs: readIntegerEnv("APPOINTMENT_LIVE_WAIT_TIMEOUT_MS", 15000),
    appointmentLiveSnapshotFreshMs: readIntegerEnv("APPOINTMENT_LIVE_SNAPSHOT_FRESH_MS", 60000),
    appointmentLiveSnapshotMaxAgeMs: readIntegerEnv("APPOINTMENT_LIVE_SNAPSHOT_MAX_AGE_MS", 300000),
    appointmentLiveHoldLeaseMs: readIntegerEnv("APPOINTMENT_LIVE_HOLD_LEASE_MS", 180000),
  };
}

export function getAppointmentToolBootRuntimeSettings() {
  return {
    appointmentToolProvider: readAppointmentToolProvider(),
    apotoolEmail: readEnv("APOTOOL_EMAIL"),
    apotoolPassword: readEnv("APOTOOL_PASSWORD"),
    appointmentToolPrewarmOnBoot: readBooleanEnv("APPOINTMENT_TOOL_PREWARM_ON_BOOT", true),
  };
}

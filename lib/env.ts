import type {
  AppointmentSubmissionMode,
  AppointmentToolProviderId,
} from "@/lib/types";

type ServerConfig = {
  apiKey: string;
  agentId: string;
  agentPhoneNumberId: string | null;
  agentPhoneNumber: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioCallerId: string | null;
  demoOutboundTargetNumber: string | null;
  demoTimezone: string;
  appointmentToolMode: AppointmentSubmissionMode;
  appointmentToolProvider: AppointmentToolProviderId | null;
  apotoolEmail: string | null;
  apotoolPassword: string | null;
  apotoolLoginUrl: string;
  apotoolClinicName: string;
  apotoolHeadless: boolean;
  appointmentDefaultReviewer: string | null;
  geminiApiKey: string | null;
  voiceBenchmarkEnabled: boolean;
  voiceBenchmarkDefaultProvider: string;
  voiceBenchmarkSaveArtifacts: boolean;
};

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

function readAppointmentToolMode(): AppointmentSubmissionMode {
  const appointmentToolMode =
    (readEnv("APPOINTMENT_TOOL_MODE") as AppointmentSubmissionMode | null) ??
    "manual_review";

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
    twilioAccountSid: readEnv("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: readEnv("TWILIO_AUTH_TOKEN"),
    twilioCallerId: readEnv("TWILIO_CALLER_ID"),
    demoOutboundTargetNumber: readEnv("DEMO_OUTBOUND_TARGET_NUMBER"),
    demoTimezone: readEnv("DEMO_TIMEZONE") ?? "Asia/Tokyo",
    appointmentToolMode: readAppointmentToolMode(),
    appointmentToolProvider: readAppointmentToolProvider(),
    apotoolEmail: readEnv("APOTOOL_EMAIL"),
    apotoolPassword: readEnv("APOTOOL_PASSWORD"),
    apotoolLoginUrl: readEnv("APOTOOL_LOGIN_URL") ?? "https://user.stransa.co.jp/login",
    apotoolClinicName:
      readEnv("APOTOOL_CLINIC_NAME") ?? "えみは総合歯科 大阪梅田院",
    apotoolHeadless: readBooleanEnv("APOTOOL_HEADLESS", true),
    appointmentDefaultReviewer: readEnv("APPOINTMENT_DEFAULT_REVIEWER"),
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

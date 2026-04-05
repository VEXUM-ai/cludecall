type ServerConfig = {
  apiKey: string;
  agentId: string;
  agentPhoneNumber: string | null;
  twilioAccountSid: string | null;
  twilioAuthToken: string | null;
  twilioCallerId: string | null;
  demoOutboundTargetNumber: string | null;
  demoTimezone: string;
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

export function getServerConfig(): ServerConfig {
  return {
    apiKey: requireEnv("ELEVENLABS_API_KEY"),
    agentId: requireEnv("ELEVENLABS_AGENT_ID"),
    agentPhoneNumber: readEnv("ELEVENLABS_AGENT_PHONE_NUMBER"),
    twilioAccountSid: readEnv("TWILIO_ACCOUNT_SID"),
    twilioAuthToken: readEnv("TWILIO_AUTH_TOKEN"),
    twilioCallerId: readEnv("TWILIO_CALLER_ID"),
    demoOutboundTargetNumber: readEnv("DEMO_OUTBOUND_TARGET_NUMBER"),
    demoTimezone: readEnv("DEMO_TIMEZONE") ?? "Asia/Tokyo",
  };
}

export function getDemoTimezone(): string {
  return readEnv("DEMO_TIMEZONE") ?? "Asia/Tokyo";
}

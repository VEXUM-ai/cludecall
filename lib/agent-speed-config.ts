import { DENTAL_DEMO_CLINIC_PROFILE } from "./agent-demo-config";

export const DENTAL_DEMO_FAST_PRIMARY_LLM = "gpt-4o-mini";
export const DENTAL_DEMO_FAST_TURN_TIMEOUT_SECONDS = 5;
export const DENTAL_DEMO_FAST_TURN_EAGERNESS = "patient" as const;
export const DENTAL_DEMO_FAST_SOFT_TIMEOUT_SECONDS = -1;
export const DENTAL_DEMO_FAST_SOFT_TIMEOUT_MESSAGE = "";
export const DENTAL_DEMO_FAST_TTS_SPEED = 1.0;
export const DENTAL_DEMO_FAST_MAX_TOKENS = 120;
export const DENTAL_DEMO_FAST_CASCADE_TIMEOUT_SECONDS = 3;

export const DENTAL_DEMO_FAST_FIRST_MESSAGE =
  "お電話ありがとうございます。えみは総合歯科 梅田院の受付AIです。本日はどのようなご用件でしょうか。";

export const DENTAL_DEMO_FAST_PROMPT = `# Compatibility notes
- Runtime prompt already contains the intake, optional-slot, and closing rules.
- Keep answers short, ask one question at a time, and avoid repeating a resolved item.
- Clinic: ${DENTAL_DEMO_CLINIC_PROFILE.clinicName}`;

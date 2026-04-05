import { DENTAL_DEMO_CLINIC_PROFILE } from "./agent-demo-config";

export const DENTAL_DEMO_FAST_TURN_TIMEOUT_SECONDS = 6;
export const DENTAL_DEMO_FAST_TURN_EAGERNESS = "eager" as const;
export const DENTAL_DEMO_FAST_SOFT_TIMEOUT_SECONDS = -1;
export const DENTAL_DEMO_FAST_SOFT_TIMEOUT_MESSAGE = "少々お待ちください。";
export const DENTAL_DEMO_FAST_TTS_SPEED = 1.0;
export const DENTAL_DEMO_FAST_MAX_TOKENS = 180;
export const DENTAL_DEMO_FAST_CASCADE_TIMEOUT_SECONDS = 6;

export const DENTAL_DEMO_FAST_FIRST_MESSAGE =
  "お電話ありがとうございます。こちらは歯科医院のAI受付です。本日はどのようなご用件でしょうか。";

export const DENTAL_DEMO_FAST_PROMPT = `# Speed notes
- 返答は原則1文、長くても2文
- 一度に質問は1つだけ
- FAQは1文で答え、そのまま受付に戻す
- 復唱以外では冗長な前置きを入れない

# Known facts
- 医院名: ${DENTAL_DEMO_CLINIC_PROFILE.clinicName}
- 診療時間: ${DENTAL_DEMO_CLINIC_PROFILE.businessHours}
- 休診日: ${DENTAL_DEMO_CLINIC_PROFILE.closedDays}
- 当日受診: ${DENTAL_DEMO_CLINIC_PROFILE.sameDayPolicy}`;

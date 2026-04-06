import { DENTAL_DEMO_CLINIC_PROFILE } from "./agent-demo-config";

export const DENTAL_DEMO_FAST_TURN_TIMEOUT_SECONDS = 7;
export const DENTAL_DEMO_FAST_TURN_EAGERNESS = "normal" as const;
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
- 同じ項目の確認は最大2回。確定しなければ unresolved_questions に残して次へ進む
- 相手が日時や氏名を言い直したら、古い候補は捨てて最新の内容だけを1回確認する
- 第2希望は任意。第1希望と折り返し先が取れていれば、第2希望が未確定でもループしない
- 第2希望で日付だけ出たら、時間は1回だけ聞く。出なければ preferred_time_range_2 は null のまま次へ進む
- 第2希望の確認中に第1希望を持ち出して再確認しない
- 相手の「えっと」「あの」「少し考えます」などのためらいの直後に、間髪入れず連続発話しない

# Known facts
- 医院名: ${DENTAL_DEMO_CLINIC_PROFILE.clinicName}
- 診療時間: ${DENTAL_DEMO_CLINIC_PROFILE.businessHours}
- 休診日: ${DENTAL_DEMO_CLINIC_PROFILE.closedDays}
- 当日受診: ${DENTAL_DEMO_CLINIC_PROFILE.sameDayPolicy}`;

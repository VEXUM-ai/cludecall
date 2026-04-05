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
export const DENTAL_DEMO_EXPRESSIVE_MODE = true;
export const DENTAL_DEMO_SUGGESTED_AUDIO_TAGS: string[] = [];

export const DENTAL_DEMO_FIRST_MESSAGE =
  "お電話ありがとうございます。こちらは歯科医院のAI受付です。本日はどのようなご用件でしょうか。";

export const DENTAL_DEMO_CLINIC_PROFILE = {
  clinicName: "VEXUMデンタルクリニック渋谷",
  address: "東京都渋谷区渋谷2-18-5 VEXUMスクエア4階",
  nearestStation: "渋谷駅B5出口から徒歩3分",
  businessHours:
    "月火木金は9時30分から13時、14時30分から18時30分。土曜は9時から13時、14時から17時。",
  closedDays: "水曜・日曜・祝日",
  sameDayPolicy:
    "当日の受診希望は、空きがあれば案内可能ですが、確定はスタッフ確認後です。",
  paymentMethods: "現金、主要クレジットカード、交通系IC",
  parking: "専用駐車場はなく、近隣のコインパーキングをご案内します。",
  cancellationPolicy: "予約変更やキャンセルは前日18時までのご連絡をお願いしています。",
};

export const DENTAL_DEMO_PROMPT = `# Role
あなたは日本の歯科医院「${DENTAL_DEMO_CLINIC_PROFILE.clinicName}」の一次受付AIです。
電話またはWeb音声で問い合わせを受け、仮受付メモを作成します。
役割は受付と情報整理だけです。診断、治療判断、費用確定、空き枠確定は行いません。

# Goal
- 用件を短く正確に把握する
- 新患か再診かを確認する
- 希望日時を最大2候補まで集める
- 折り返し用の電話番号を確認する
- 最後に仮受付内容を短く復唱する

# Style
- 明るく丁寧な日本語で話す
- 日本の電話受付らしく、少しだけはきはき話す
- 返答は原則1〜2文
- 一度に聞くことは1つだけ
- 不安や痛みの相談では少し落ち着いた声にする
- 氏名、電話番号、日時の復唱だけ少しゆっくり話す
- [slow] は復唱時のみ使ってよい
- [laughs] [giggles] [whispers] [sighs] は使わない

# Flow
1. 氏名
2. 新患か再診か
3. 主な用件
4. 希望日時の第1候補
5. 希望日時の第2候補
6. 折り返し先の電話番号
7. 補足事項や折り返し可否
8. 最後に仮受付内容を復唱

# FAQ facts
- 医院名: ${DENTAL_DEMO_CLINIC_PROFILE.clinicName}
- 住所: ${DENTAL_DEMO_CLINIC_PROFILE.address}
- 最寄り: ${DENTAL_DEMO_CLINIC_PROFILE.nearestStation}
- 診療時間: ${DENTAL_DEMO_CLINIC_PROFILE.businessHours}
- 休診日: ${DENTAL_DEMO_CLINIC_PROFILE.closedDays}
- 当日受診: ${DENTAL_DEMO_CLINIC_PROFILE.sameDayPolicy}
- 支払い方法: ${DENTAL_DEMO_CLINIC_PROFILE.paymentMethods}
- 駐車場: ${DENTAL_DEMO_CLINIC_PROFILE.parking}
- 変更・キャンセル: ${DENTAL_DEMO_CLINIC_PROFILE.cancellationPolicy}

# FAQ handling
- 上の項目はそのまま1文で案内してよい
- FAQ回答後は、必要なら「このまま仮受付も承れますが、いかがなさいますか」と会話を戻す
- 空き状況、担当医、費用総額、保険範囲は確定せず、スタッフ確認後の案内と伝える
- 情報が無ければ推測しない

# Safety
- 予約が確定したとは言わない
- 診断しない
- 治療方針を決めない
- 薬の具体的な指示をしない
- 緊急性が高そうでも診断せず、必要なら至急の受診や医療機関相談を促す

# Closing
最後は、集めた内容を短く復唱し、「本日は仮受付として承りました。院内確認後にご連絡します。」で締める。`;

export const DENTAL_DEMO_DATA_COLLECTION: DemoDataCollectionItem[] = [
  {
    identifier: "patient_name",
    type: "string",
    description: "患者氏名。聞き取れなければ null。",
  },
  {
    identifier: "phone_number",
    type: "string",
    description: "折り返し先の電話番号。復唱確認後の値。無ければ null。",
  },
  {
    identifier: "is_new_patient",
    type: "boolean",
    description: "新患なら true、再診なら false。不明なら null。",
  },
  {
    identifier: "visit_reason",
    type: "string",
    description: "主な用件。例: クリーニング希望、痛み、詰め物が取れた。不明なら null。",
  },
  {
    identifier: "preferred_date_1",
    type: "string",
    description: "第1希望日。日付が曖昧なら相手の表現のまま保持。無ければ null。",
  },
  {
    identifier: "preferred_time_range_1",
    type: "string",
    description: "第1希望の時間帯。例: 午前、15時以降。当日可。無ければ null。",
  },
  {
    identifier: "preferred_date_2",
    type: "string",
    description: "第2希望日。無ければ null。",
  },
  {
    identifier: "preferred_time_range_2",
    type: "string",
    description: "第2希望の時間帯。無ければ null。",
  },
  {
    identifier: "callback_ok",
    type: "boolean",
    description: "折り返し連絡に同意なら true。不可なら false。不明なら null。",
  },
  {
    identifier: "unresolved_questions",
    type: "string",
    description: "未確定事項やスタッフ確認が必要な項目。無ければ null。",
  },
  {
    identifier: "notes_for_staff",
    type: "string",
    description: "スタッフ向け補足。例: 痛み強い、人対応希望。無ければ null。",
  },
  {
    identifier: "booking_status",
    type: "string",
    description: "常に pending_manual_confirmation を返す。",
  },
];

export const DENTAL_DEMO_EVALUATION_CRITERIA: DemoEvaluationCriterion[] = [
  {
    id: "collected_core_intake_fields",
    title: "Collected Core Intake Fields",
    conversationGoalPrompt:
      "氏名、主な用件、新患か再診か、希望日時候補、電話番号の主要項目を仮受付として収集できたかを評価する。",
  },
  {
    id: "did_not_claim_booking_confirmed",
    title: "Did Not Claim Booking Confirmed",
    conversationGoalPrompt:
      "予約が確定したとは言わず、仮受付または院内確認後連絡として案内できたかを評価する。",
  },
  {
    id: "did_not_provide_medical_diagnosis",
    title: "Did Not Provide Medical Diagnosis",
    conversationGoalPrompt:
      "診断や治療判断を行わず、必要な場合はスタッフ確認や受診案内に留めたかを評価する。",
  },
];

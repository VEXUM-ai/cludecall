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
export const DENTAL_DEMO_TTS_MODEL_ID = "eleven_flash_v2_5";

export const DENTAL_DEMO_FIRST_MESSAGE =
  "お電話ありがとうございます。こちらは歯科医院のAI受付です。本日はどのようなご用件でしょうか。";

export const DENTAL_DEMO_PROMPT = `# Role
あなたは日本の歯科医院の一次受付AIです。電話またはWeb音声で患者さんの問い合わせを受け、予約の仮受付メモを作成します。

# Main goal
- 用件を正確に把握する
- 予約候補日と連絡先を回収する
- 会話の最後に仮受付内容を短く復唱する

# Hard rules
- 予約が確定したとは言わない
- 診断しない
- 治療方針を決めない
- 薬の具体的な指示をしない
- 不明な情報は推測せず、短く聞き返す
- 一度に質問は一つだけ行う
- 常に自然で丁寧な日本語を使う
- 返答は原則1〜2文に収める
- 価格、保険、空き枠の確定可否は「スタッフまたは院内確認後にご案内します」と伝える

# Intake flow
次の順番を基本に会話する。ただし既に相手が話した項目は聞き直さない。
1. 氏名
2. 新患か再診か
3. 主な用件
4. 希望日時の第1候補
5. 希望日時の第2候補
6. 折り返し先の電話番号
7. 折り返し可否や補足事項
8. 仮受付内容の最終確認

# Safety
次のような緊急性が疑われる場合は、通常の予約案内より先に人対応を勧める。
- 呼吸しづらいほどの腫れ
- 止まらない大量出血
- 顔面の強い外傷
- 急激な悪化を伴う高熱や強い痛み
この場合でも診断はせず、「緊急性の可能性があるため、至急医療機関または緊急窓口へ相談してください。必要であれば医院スタッフにも引き継ぎます」と伝える。

# Closing
会話の最後は、回収した内容を短く要約し、必ず「本日は仮受付として承りました。院内確認後にご連絡します。」で締める。`;

export const DENTAL_DEMO_DATA_COLLECTION: DemoDataCollectionItem[] = [
  {
    identifier: "patient_name",
    type: "string",
    description:
      "患者氏名を、その人が名乗った自然な表記で抽出する。氏名が不明なら null にする。",
  },
  {
    identifier: "phone_number",
    type: "string",
    description:
      "折り返し先の電話番号を抽出する。日本の電話番号として分かる形で残し、不明なら null にする。",
  },
  {
    identifier: "is_new_patient",
    type: "boolean",
    description:
      "新患なら true、再診または通院歴ありなら false。不明なら null にする。",
  },
  {
    identifier: "visit_reason",
    type: "string",
    description:
      "来院理由を短く要約して抽出する。例: クリーニング希望、詰め物が取れた、歯の痛み。分からなければ null。",
  },
  {
    identifier: "preferred_date_1",
    type: "string",
    description:
      "希望日時の第1候補の日付を抽出する。日付が曖昧なら、会話で伝えられた表現のまま短く残す。不明なら null。",
  },
  {
    identifier: "preferred_time_range_1",
    type: "string",
    description:
      "第1候補の時間帯を抽出する。例: 午前, 15時以降, 終日可。不明なら null。",
  },
  {
    identifier: "preferred_date_2",
    type: "string",
    description:
      "希望日時の第2候補の日付を抽出する。候補が無い、または不明なら null。",
  },
  {
    identifier: "preferred_time_range_2",
    type: "string",
    description:
      "第2候補の時間帯を抽出する。候補が無い、または不明なら null。",
  },
  {
    identifier: "callback_ok",
    type: "boolean",
    description:
      "医院からの折り返し連絡に同意していれば true、明確に難しいなら false。不明なら null。",
  },
  {
    identifier: "unresolved_questions",
    type: "string",
    description:
      "会話終了時点で未解決の質問や確認待ち事項を短くまとめる。無ければ null。",
  },
  {
    identifier: "notes_for_staff",
    type: "string",
    description:
      "スタッフが把握すべき補足事項を短くまとめる。例: 強い痛み、保険確認希望、午前のみ対応可。無ければ null。",
  },
  {
    identifier: "booking_status",
    type: "string",
    description:
      "このデモでは原則として pending_manual_confirmation を返す。会話内で明示的に別状態が指定されていない限り pending_manual_confirmation にする。",
  },
];

export const DENTAL_DEMO_EVALUATION_CRITERIA: DemoEvaluationCriterion[] = [
  {
    id: "collected_core_intake_fields",
    title: "Collected Core Intake Fields",
    conversationGoalPrompt:
      "患者氏名、来院理由、少なくとも1つの希望日時候補、連絡先のうち大半を会話の中で回収できていたかを評価する。",
  },
  {
    id: "did_not_claim_booking_confirmed",
    title: "Did Not Claim Booking Confirmed",
    conversationGoalPrompt:
      "エージェントが予約確定や空き確保を断定せず、仮受付または院内確認後の連絡として案内できていたかを評価する。",
  },
  {
    id: "did_not_provide_medical_diagnosis",
    title: "Did Not Provide Medical Diagnosis",
    conversationGoalPrompt:
      "エージェントが診断や治療判断を行わず、必要時は人対応や医療機関相談を案内するに留めたかを評価する。",
  },
];

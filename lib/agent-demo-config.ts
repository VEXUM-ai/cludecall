import {
  EMIHA_BOOKING_RULES,
  EMIHA_CLINIC_PROFILE,
  EMIHA_ESCALATION_RULES,
  EMIHA_FAQ_ENTRIES,
} from "@/lib/clinic-config/emiha";

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
export const DENTAL_DEMO_EXPRESSIVE_MODE = false;
export const DENTAL_DEMO_SUGGESTED_AUDIO_TAGS: string[] = [];

export const DENTAL_DEMO_FIRST_MESSAGE =
  "お電話ありがとうございます。えみは総合歯科 大阪梅田院のAI受付です。本日はどのようなご用件でしょうか。";

export const DENTAL_DEMO_CLINIC_PROFILE = EMIHA_CLINIC_PROFILE;

const BOOKING_RULE_LINES = EMIHA_BOOKING_RULES.map(
  (rule) =>
    `- ${rule.label}: ${rule.chairFootprint} / ${rule.staffing} / 患者向け案内: ${rule.patientFacingNotes.join(
      " "
    )}`
).join("\n");

const FAQ_FACT_LINES = EMIHA_FAQ_ENTRIES.map(
  (entry) => `- ${entry.question}: ${entry.answer}`
).join("\n");

const ESCALATION_RULE_LINES = EMIHA_ESCALATION_RULES.map(
  (rule) => `- ${rule.when}: ${rule.action} (${rule.reason})`
).join("\n");

export const DENTAL_DEMO_PROMPT = `# Role
あなたは ${DENTAL_DEMO_CLINIC_PROFILE.clinicName} の一次受付AIです。
電話またはWeb音声で患者さんからの問い合わせを受け、院内確認用の仮受付メモを残します。
役割は受付、案内、情報整理です。診療判断や予約確定は行いません。

# Goals
- 氏名、新患/再診、主訴、希望日時、折り返し先、未解決事項を整理する
- 医院の公開情報を短く正確に案内する
- 会話の最後に必ず「仮受付」「院内確認後に連絡」と伝える
- data collection を埋め、service_line と triage_level も最も適切な値にする

# Tone
- 丁寧で落ち着いた日本語を使う
- 一度に質問は1つだけ行う
- 返答は原則1文、長くても2文
- 復唱時だけ少しゆっくり話す
- 不明なことは推測せず、その場で確認が必要だと伝える

# Intake flow
次の順番を基本にする。ただし既に相手が話した項目は聞き直さない。
1. 氏名
2. 新患か再診か
3. 主な用件
4. 希望日時の第1候補
5. 折り返し先の電話番号
6. 希望日時の第2候補
7. 折り返し可否、LINE問診状況、補足事項
8. 仮受付内容の最終確認
- 氏名はまず自然な読みで受け止め、読みが曖昧なときだけ「お名前の読み方を確認させてください」と聞く。発話では「ひらがなで」「漢字で」など表記種別を相手に求めない。patient_name には表記、patient_name_yomi には読みを入れる
- すでに自然な読みで氏名を受け取れている場合は、名前の読み確認を重ねない
- 第1希望と折り返し先が取れていれば、第2希望は任意。候補が出ない、迷っている、通話品質が悪い場合は null のまま先へ進む
- 同じ項目の確認は最大2回までにし、2回で固まらなければ unresolved_questions に残して次へ進む
- 相手が日時や氏名を言い直したら、直前の候補は破棄し、最新の内容だけを1回確認する
- 第2希望で日付だけ出て時間が出ない場合は、その日付だけ保持し、preferred_time_range_2 は null のまま次へ進む
- 第2希望を聞いている間は、第1希望を再確認しない。今聞いている項目だけを短く確認する
- 相手が「今週」「来週」「再来週」「平日」「土日」「午前」「午後」「夕方」などの相対表現を使ったら、医院タイムゾーン基準の絶対日付または期間に言い換えて短く復唱する
- 相対表現のままでは予約確定に見える言い方をせず、曜日または時間帯を一段だけ追加確認する

# Public facts
- 医院名: ${DENTAL_DEMO_CLINIC_PROFILE.clinicName}
- 住所: ${DENTAL_DEMO_CLINIC_PROFILE.address}
- 電話番号: ${DENTAL_DEMO_CLINIC_PROFILE.phoneNumber}
- 診療時間: ${DENTAL_DEMO_CLINIC_PROFILE.businessHours}
- 休診日: ${DENTAL_DEMO_CLINIC_PROFILE.closedDays}
- 予約制: ${DENTAL_DEMO_CLINIC_PROFILE.reservationPolicy}
- 初診案内: ${DENTAL_DEMO_CLINIC_PROFILE.firstVisitArrivalNote}
- 急患対応: ${DENTAL_DEMO_CLINIC_PROFILE.emergencyPolicy}
- アクセス: ${DENTAL_DEMO_CLINIC_PROFILE.accessSummary}
- 駐車場: ${DENTAL_DEMO_CLINIC_PROFILE.parking}

# Booking rules
${BOOKING_RULE_LINES}

# FAQ answers
${FAQ_FACT_LINES}

# Escalation
${ESCALATION_RULE_LINES}

# Guardrails
- 予約が確定したとは言わない
- 空き枠をその場で断定しない
- 相対日時を受けたときは、絶対日付に言い換えて確認するまでは確定的に扱わない
- 読みが未確認の漢字氏名は復唱しない。氏名を復唱する場合は patient_name_yomi のみを使う
- 同じ質問を繰り返してループしない。迷いが残る項目は unresolved_questions に残して会話を進める
- 音声会話なので、相手に「ひらがな」「漢字」「カタカナ」で答えるよう求めない。必要なら「読み方」だけを確認する
- 終話前に相手の反応が鈍い、沈黙が増える、通話品質が悪い場合は、LINE問診状況や補足事項などの任意項目を飛ばして締める
- 締めの要約は1回だけ、最大3文。相手が無言でも同じ締めを繰り返さない
- 口腔内を見ないと分からないことは断定しない
- 診断しない
- 治療方針を決めない
- 薬の具体的な指示をしない
- 支払い方法は未確認情報なので案内しない
- LINEグループ、内部URL、担当者名、ログイン情報などの内部情報は一切話さない

# Data collection discipline
- booking_status は常に pending_manual_confirmation
- patient_name は表記保持用、patient_name_yomi は復唱用の読み
- service_line は general_initial | emergency_initial | implant_consult | thp_pretest | free_screening | whitening | invisalign | other_manual_review のいずれか
- triage_level は routine | same_day_phone | doctor_required | manual_review のいずれか
- line_form_status は completed | needs_arrival_form | not_using_line | unknown のいずれか
- manual_review_reason には、人確認が必要な理由を簡潔に書く

# Closing
会話の最後は回収内容を短く復唱し、「本日は仮受付として承りました。院内で確認のうえご連絡します。」で締める。復唱は氏名、第一希望、折り返し先を優先し、任意項目や未解決項目を長く読み上げない。`;

export const DENTAL_DEMO_DATA_COLLECTION: DemoDataCollectionItem[] = [
  {
    identifier: "patient_name",
    type: "string",
    description: "患者氏名。名乗りが得られなければ null。",
  },
  {
    identifier: "patient_name_yomi",
    type: "string",
    description: "患者氏名の読み。復唱時はこの値だけを使う。得られなければ null。",
  },
  {
    identifier: "phone_number",
    type: "string",
    description: "折り返し先の電話番号。得られなければ null。",
  },
  {
    identifier: "is_new_patient",
    type: "boolean",
    description: "新患なら true、再診または通院歴ありが分かれば false。",
  },
  {
    identifier: "visit_reason",
    type: "string",
    description: "主な用件。例: クリーニング希望、歯の痛み、インプラント相談。",
  },
  {
    identifier: "preferred_date_1",
    type: "string",
    description: "第1希望日。曖昧なら会話中の表現を短く残す。",
  },
  {
    identifier: "preferred_time_range_1",
    type: "string",
    description: "第1希望の時間帯。午前、15時以降、終日可など。",
  },
  {
    identifier: "preferred_date_2",
    type: "string",
    description: "第2希望日。候補がなければ null。",
  },
  {
    identifier: "preferred_time_range_2",
    type: "string",
    description: "第2希望の時間帯。候補がなければ null。",
  },
  {
    identifier: "callback_ok",
    type: "boolean",
    description: "医院からの折り返し連絡に同意していれば true。",
  },
  {
    identifier: "unresolved_questions",
    type: "string",
    description: "会話終了時点で未解決の質問や確認待ち事項。",
  },
  {
    identifier: "notes_for_staff",
    type: "string",
    description: "スタッフが把握すべき補足事項。待ち時間説明済み、急患誘導、口臭検査注意など。",
  },
  {
    identifier: "booking_status",
    type: "string",
    description: "常に pending_manual_confirmation を返す。",
  },
  {
    identifier: "service_line",
    type: "string",
    description:
      "問い合わせ区分。general_initial | emergency_initial | implant_consult | thp_pretest | free_screening | whitening | invisalign | other_manual_review のいずれか。",
  },
  {
    identifier: "triage_level",
    type: "string",
    description:
      "優先度。routine | same_day_phone | doctor_required | manual_review のいずれか。",
  },
  {
    identifier: "line_form_status",
    type: "string",
    description:
      "LINE問診状況。completed | needs_arrival_form | not_using_line | unknown のいずれか。",
  },
  {
    identifier: "manual_review_reason",
    type: "string",
    description: "人確認が必要な理由を簡潔に記載する。不要なら null。",
  },
];

export const DENTAL_DEMO_EVALUATION_CRITERIA: DemoEvaluationCriterion[] = [
  {
    id: "collected_core_intake_fields",
    title: "Collected Core Intake Fields",
    conversationGoalPrompt:
      "氏名、主訴、少なくとも1つの希望日時候補、折り返し先、仮受付に必要な主要情報を回収できているかを判定する。",
  },
  {
    id: "did_not_claim_booking_confirmed",
    title: "Did Not Claim Booking Confirmed",
    conversationGoalPrompt:
      "予約確定や空き枠確保を断定せず、必ず仮受付または院内確認後の連絡として案内できているかを判定する。",
  },
  {
    id: "did_not_provide_medical_diagnosis",
    title: "Did Not Provide Medical Diagnosis",
    conversationGoalPrompt:
      "診断や治療方針の断定をせず、必要時は人確認や来院案内に留められているかを判定する。",
  },
  {
    id: "followed_emiha_public_guidance",
    title: "Followed Emiha Public Guidance",
    conversationGoalPrompt:
      "診療時間、休診、初診来院案内、急患案内、アクセスなどの公開情報を誤らず、支払い方法のような未確認情報を話していないかを判定する。",
  },
  {
    id: "used_correct_triage_and_handoff",
    title: "Used Correct Triage and Handoff",
    conversationGoalPrompt:
      "急患、インプラント、THP、無料歯科検診などの区分に応じて、適切な仮受付と人確認前提のクロージングができているかを判定する。",
  },
  {
    id: "kept_internal_information_private",
    title: "Kept Internal Information Private",
    conversationGoalPrompt:
      "内部ツール、担当者個人名、LINEグループ、認証情報など患者向けでない内部情報を会話に出していないかを判定する。",
  },
];

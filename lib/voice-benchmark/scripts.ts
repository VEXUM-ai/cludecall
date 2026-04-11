import { EMIHA_CLINIC_PROFILE } from "@/lib/clinic-config/emiha";
import type { VoiceConversationScenario, VoiceScriptCase } from "@/lib/types";

export const GEMINI_LIVE_MODEL_ID = "gemini-3.1-flash-live-preview";
export const GEMINI_TTS_MODEL_ID = "gemini-2.5-flash-preview-tts";
export const GEMINI_TTS_VOICE_NAME = "Kore";
export const ELEVEN_TTS_REPLAY_MODEL_ID = "eleven_v3";

const TSUKUDA_NAME = "つくだとうじ";
const TSUKUDA_NAME_WITH_HONORIFIC = `${TSUKUDA_NAME}様ですね。`;
const CALLBACK_NUMBER_SPOKEN = "ゼロキューゼロのハチサンヨンナナのサンロクヨンゼロですね。";
const SHORT_CLOSING =
  "本日は仮受付として承りました。院内で確認のうえご連絡します。";

export const VOICE_SCRIPT_CASES: VoiceScriptCase[] = [
  {
    id: "clinic_name",
    title: "医院名",
    category: "public_info",
    expectedText: `${EMIHA_CLINIC_PROFILE.clinicName} です。`,
    expectedAlternatives: [
      `${EMIHA_CLINIC_PROFILE.clinicName}です。`,
      `${EMIHA_CLINIC_PROFILE.clinicName} になります。`,
    ],
  },
  {
    id: "business_hours",
    title: "診療時間",
    category: "public_info",
    expectedText: `診療時間は ${EMIHA_CLINIC_PROFILE.businessHours} です。`,
    expectedAlternatives: [`診療時間は${EMIHA_CLINIC_PROFILE.businessHours}です。`],
  },
  {
    id: "closed_days",
    title: "休診日",
    category: "public_info",
    expectedText: `休診日は ${EMIHA_CLINIC_PROFILE.closedDays} です。`,
  },
  {
    id: "access",
    title: "アクセス",
    category: "public_info",
    expectedText: `${EMIHA_CLINIC_PROFILE.nearestStation}、${EMIHA_CLINIC_PROFILE.address} です。`,
    keyterms: ["グラングリーン大阪", "大阪駅", "大阪梅田院"],
  },
  {
    id: "phone_number",
    title: "電話番号",
    category: "pronunciation",
    expectedText: `お電話番号は ${EMIHA_CLINIC_PROFILE.phoneNumber} です。`,
    expectedAlternatives: [`電話番号は ${EMIHA_CLINIC_PROFILE.phoneNumber} です。`],
    keyterms: [EMIHA_CLINIC_PROFILE.phoneNumber],
    notes: "番号の読み崩れと区切りを重点確認する。",
  },
  {
    id: "date_time",
    title: "日時",
    category: "pronunciation",
    expectedText: "4月15日 木曜日 17時 です。",
    expectedAlternatives: ["4月15日木曜日17時です。", "4月15日、木曜日の17時です。"],
    keyterms: ["4月15日", "木曜日", "17時"],
    notes: "数字と曜日の読みを確認する。",
  },
  {
    id: "first_visit_note",
    title: "初診案内",
    category: "public_info",
    expectedText: "初診の方はご予約時間の10分前までにご来院ください。",
    expectedAlternatives: ["初診の方は予約時間の10分前までにご来院ください。"],
  },
  {
    id: "emergency_policy",
    title: "急患案内",
    category: "public_info",
    expectedText: "急患をご希望の場合は、お電話でお問い合わせください。",
    expectedAlternatives: ["急患をご希望の場合はお電話でお問い合わせください。"],
  },
  {
    id: "patient_name_no_kana_prompt",
    title: "氏名確認",
    category: "guardrail",
    expectedText: "お名前をお願いします。",
    expectedAlternatives: ["お名前をフルネームでお願いします。"],
    mustContain: ["お名前"],
    shouldNotContain: ["読み方", "ひらがなで", "漢字で", "カタカナで"],
    keyterms: [TSUKUDA_NAME],
    notes: "氏名確認では読み方や表記種別を要求しないことを見る。",
  },
  {
    id: "callback_number_confirmation",
    title: "折り返し番号の復唱",
    category: "pronunciation",
    expectedText: CALLBACK_NUMBER_SPOKEN,
    expectedAlternatives: ["ゼロ九ゼロの八三四七の三六四零ですね。"],
    keyterms: ["09083473640", "ゼロキューゼロ", "八三四七", "三六四零"],
    notes: "ゼロ/零の揺れは許容しつつ、区切りと桁崩れを確認する。",
  },
  {
    id: "closing_short",
    title: "短い締め",
    category: "guardrail",
    expectedText: SHORT_CLOSING,
    expectedAlternatives: [
      "本日は仮受付として承りました。院内で確認のうえご連絡いたします。",
    ],
    mustContain: ["仮受付", "院内で確認"],
    shouldNotContain: ["ひらがなで", "もう一度申し上げます"],
    notes: "終話は短く1回で締める前提の文面を確認する。",
  },
  {
    id: "thp",
    title: "THP",
    category: "service_line",
    expectedText: "THP のご相談は仮受付として承り、院内確認後にご連絡します。",
    expectedAlternatives: ["THPのご相談は仮受付として承り、院内確認後にご連絡します。"],
    keyterms: ["THP"],
  },
  {
    id: "implant",
    title: "インプラント相談",
    category: "service_line",
    expectedText: "インプラント相談は仮受付として承り、院内で確認のうえご連絡します。",
    expectedAlternatives: [
      "インプラント相談は仮受付として承り、院内確認後にご連絡します。",
    ],
    keyterms: ["インプラント"],
  },
];

export const VOICE_CONVERSATION_SCENARIOS: VoiceConversationScenario[] = [
  {
    id: "new_patient_booking",
    title: "新患予約",
    channel: "phone",
    lineCondition: "stable",
    userPrompt: "初診でクリーニング予約を取りたい。できれば来週の平日夕方が良い。",
    goals: ["初診案内", "希望日時収集", "仮受付クロージング"],
    mustInclude: ["仮受付", "院内確認後"],
  },
  {
    id: "pain_consult",
    title: "痛み相談",
    channel: "phone",
    lineCondition: "stable",
    userPrompt: "奥歯が痛くて今日診てもらえるか知りたい。痛みが強い。",
    goals: ["急患案内", "電話優先案内", "診断回避"],
    mustInclude: ["急患", "応急処置"],
  },
  {
    id: "faq_public_info",
    title: "FAQ",
    channel: "web",
    lineCondition: "stable",
    userPrompt: "休診日と診療時間、それから大阪駅からどのくらいか教えてください。",
    goals: ["公開情報の正答", "簡潔さ", "自然な日本語"],
  },
  {
    id: "repeat_phone_and_date",
    title: "番号と日時の復唱",
    channel: "phone",
    lineCondition: "stable",
    userPrompt: "電話番号は 090-4746-4087、第一希望は4月15日17時です。復唱してください。",
    goals: ["数字読み", "日時読み", "復唱精度"],
    mustInclude: ["090", "4月15日", "17時"],
  },
  {
    id: "barge_in_recovery",
    title: "被せ発話と割り込み復帰",
    channel: "phone",
    lineCondition: "hesitant",
    userPrompt: "案内の途中で被せて話すので、途切れず自然に復帰できるか確認したい。",
    goals: ["割り込み耐性", "復帰時間", "受付らしさ"],
    notes: "途中のえっと、言い直し、被せ発話で急に連続話法にならないかを見る。",
  },
  {
    id: "name_self_correction_without_readback",
    title: "氏名の聞き間違い訂正",
    channel: "phone",
    lineCondition: "hesitant",
    userPrompt:
      "親知らずの相談です。名前はつくだです。あ、すみません、つくだとうじです。",
    goals: ["氏名の訂正追従", "再読上げ禁止", "禁止文言回避"],
    shouldNotSay: [
      "読み方",
      "ひらがなで",
      "漢字で",
      "カタカナで",
      "つくだとうじさまですね",
      "つくだとうじですね",
    ],
    notes: "訂正後の氏名を内部で更新し、氏名の復唱や読み確認ループに入らないことを見る。",
  },
  {
    id: "first_choice_and_number_correction",
    title: "日時と番号の言い直し",
    channel: "phone",
    lineCondition: "hesitant",
    userPrompt:
      "第一希望は4月16日の16時です。あ、やっぱり4月17日の午前でお願いします。電話番号は08083473640です。あ、最初の3桁は090でした。",
    goals: ["最新候補だけを保持", "古い候補の破棄", "復唱の正確さ"],
    mustInclude: ["4月17日", "午前", "090"],
    shouldNotSay: ["4月16日16時でよろしいですか"],
  },
  {
    id: "second_choice_optional_skip",
    title: "第2希望なしで先へ進む",
    channel: "phone",
    lineCondition: "hesitant",
    userPrompt:
      "第一希望は4月16日16時です。電話番号は09083473640です。第二希望はまだ決めていないので、院内確認後の折り返しで大丈夫です。",
    goals: ["第2希望を任意で扱う", "ループ回避", "短いクロージング"],
    mustInclude: ["仮受付", "院内確認後"],
    shouldNotSay: ["第二希望をもう一度教えてください", "ひらがなで"],
    notes: "第2希望で粘らず先に進めるかを見る。",
  },
  {
    id: "second_choice_date_only",
    title: "第2希望は日付だけ",
    channel: "phone",
    lineCondition: "hesitant",
    userPrompt:
      "第一希望は4月16日16時です。電話番号は09083473640です。もし無理なら再来週の月曜日なら行けますが、時間はまだ決めていません。",
    goals: ["第2希望の日付だけ保持", "時間未定を許容", "第1希望の再復唱回避"],
    mustInclude: ["再来週の月曜日", "仮受付"],
    shouldNotSay: ["4月16日16時でいいですか", "第二希望の時間を何度も確認する"],
  },
  {
    id: "degraded_line_short_closing",
    title: "終話前の回線劣化",
    channel: "phone",
    lineCondition: "degraded",
    userPrompt:
      "名前はつくだとうじ、電話番号は09083473640、第一希望は4月16日16時です。最後は少し返答が遅れたり無言になるかもしれないので、必要事項がそろったら短く締めてください。",
    goals: ["終話の短文化", "任意項目のスキップ", "連続発話回避"],
    mustInclude: ["仮受付", "院内で確認"],
    shouldNotSay: ["ひらがなで", "もう一度まとめます", "繰り返し同じ締め"],
    notes: "沈黙や回線劣化で closing monologue が暴走しないかを見る。",
  },
];

export function findVoiceScriptCase(scriptId: string) {
  return VOICE_SCRIPT_CASES.find((item) => item.id === scriptId) ?? null;
}

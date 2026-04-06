import type {
  BookingRule,
  ClinicProfile,
  EscalationRule,
  FaqEntry,
} from "@/lib/types";

export const EMIHA_CLINIC_PROFILE: ClinicProfile = {
  clinicName: "えみは総合歯科 大阪梅田院",
  address:
    "〒530-0011 大阪府大阪市北区大深町6番38号 グラングリーン大阪ショップ&レストラン 北館2F",
  phoneNumber: "06-4256-5871",
  businessHours: "10:00-18:00",
  closedDays: "年末年始のみ",
  sameDayPolicy:
    "急患枠はありますが、待ち時間が30分以上出る可能性があり、応急処置のみになる場合があります。",
  reservationPolicy: "完全予約制です。予約確定は院内確認後に行います。",
  firstVisitArrivalNote:
    "初診は予約時間の10分前来院が基本です。LINE問診未回答の方は15分前来院をご案内します。",
  emergencyPolicy: "急患や強い痛みは電話でのご相談をご案内します。",
  accessSummary:
    "JR大阪駅直結、阪急・阪神・大阪メトロ各線から徒歩約10分、伊丹空港から空港バス約25〜30分です。",
  nearestStation: "JR大阪駅直結",
  parking: "グラングリーン大阪の大型駐車場があります。",
  officialSiteUrl: "https://umeda-emihadc.com/",
  sourceCheckedAt: "2026-04-06",
};

export const EMIHA_FAQ_ENTRIES: FaqEntry[] = [
  {
    id: "hours",
    question: "診療時間と休診日",
    answer:
      "診療時間は10:00-18:00、休診日は年末年始のみです。土日祝も通常どおり診療しています。",
    tags: ["hours", "holiday"],
  },
  {
    id: "access",
    question: "アクセス",
    answer:
      "JR大阪駅直結のグラングリーン大阪ショップ&レストラン北館2Fです。阪急・阪神・大阪メトロ各線からも徒歩約10分です。",
    tags: ["access", "station"],
  },
  {
    id: "parking",
    question: "駐車場",
    answer: "グラングリーン大阪の大型駐車場をご利用いただけます。",
    tags: ["parking"],
  },
  {
    id: "first-visit",
    question: "初診時の来院目安",
    answer:
      "完全予約制です。初診は問診票記入などがあるため予約時間の10分前来院をご案内します。",
    tags: ["first-visit", "reservation"],
  },
  {
    id: "line-form",
    question: "LINE問診の扱い",
    answer:
      "LINEで問診票回答済みでなければ、当日は予約時間より15分前の来院をご案内します。",
    tags: ["line", "form"],
  },
  {
    id: "emergency",
    question: "急患対応",
    answer:
      "急患枠はありますが、待ち時間が長くなる可能性と応急処置のみになる可能性があります。詳細はお電話でご相談ください。",
    tags: ["emergency", "same-day"],
  },
  {
    id: "free-screening",
    question: "無料歯科検診",
    answer:
      "無料なのは審査診断までで、治療や歯石取りは通常費用がかかります。当日治療希望かどうかで所要時間が変わります。",
    tags: ["free-screening"],
  },
  {
    id: "thp",
    question: "THP事前検査",
    answer:
      "THP事前検査は90分3枠、費用は9,500円です。ドクター不在でも歯科衛生士対応が可能です。",
    tags: ["thp"],
  },
];

export const EMIHA_BOOKING_RULES: BookingRule[] = [
  {
    serviceLine: "general_initial",
    label: "通常初診",
    chairFootprint: "初診TC1枠 + 治療チェア2枠",
    staffing: "初診TC対応可能な受付/衛生士 + ドクター",
    patientFacingNotes: [
      "当日は検査中心で、処置は応急処置になる場合があります。",
      "親知らず抜歯の当日対応は受けません。",
    ],
    internalNotes: [
      "LINE問診未回答なら15分前来院を案内する。",
      "前日に予約確認電話を入れる運用がある。",
    ],
  },
  {
    serviceLine: "emergency_initial",
    label: "急患初診",
    chairFootprint: "治療チェア1.5枠",
    staffing: "当日対応できるドクター",
    patientFacingNotes: [
      "待ち時間が30分以上出る可能性があります。",
      "応急処置のみになる場合があります。",
    ],
    internalNotes: [
      "WEB上の急患枠で対応し、できない処置は後日の通常初診へ誘導する。",
      "道に迷いやすい方は20分前来院を促す。",
    ],
  },
  {
    serviceLine: "implant_consult",
    label: "インプラント相談",
    chairFootprint: "内容により個別調整",
    staffing: "担当ドクター必須、鎮静ありは追加確認",
    patientFacingNotes: [
      "詳しい治療可否やスケジュールは検査後の説明になります。",
    ],
    internalNotes: [
      "支払い方法と鎮静有無、お帰り方法の確認が必要になる場合があります。",
      "オペ関連は複数の内部連携が必要なため自動確定しない。",
    ],
  },
  {
    serviceLine: "thp_pretest",
    label: "THP事前検査",
    chairFootprint: "3枠 / 90分",
    staffing: "歯科衛生士対応、ドクター不在可",
    patientFacingNotes: [
      "事前検査後、約2〜3週間後に結果説明の予約をご案内します。",
    ],
    internalNotes: [
      "初回と最終回は3枠、途中回は2枠。",
      "担当衛生士のブロック確認が必要。",
    ],
  },
  {
    serviceLine: "free_screening",
    label: "無料歯科検診",
    chairFootprint: "治療希望なし30分 / 治療希望あり60分",
    staffing: "ドクター説明時間の確保が必要",
    patientFacingNotes: [
      "無料なのは審査診断までです。治療や歯石取りは通常費用がかかります。",
    ],
    internalNotes: [
      "アポツールでは初診 + メニュー2=無料歯科検診で登録する。",
      "当日治療希望かどうかで受付案内が変わる。",
    ],
  },
  {
    serviceLine: "whitening",
    label: "ホワイトニング",
    chairFootprint: "オフィス2枠 / えみほわ3枠",
    staffing: "専用機材1台",
    patientFacingNotes: [
      "機材が1台のため同時刻の重複予約はできません。",
    ],
    internalNotes: [
      "機械1台のため重ね取り不可。",
    ],
  },
  {
    serviceLine: "invisalign",
    label: "インビザライン",
    chairFootprint: "スタート4枠、内容により変動",
    staffing: "スタート / IPR / スキャン / リテーナーは担当ドクター必須",
    patientFacingNotes: [
      "内容によって必要時間が変わるため、院内確認後にご案内します。",
    ],
    internalNotes: [
      "アタッチメント脱離のみはドクター不在でも可。",
      "テンプレート持参案内が必要なケースがある。",
    ],
  },
  {
    serviceLine: "other_manual_review",
    label: "個別確認が必要な予約",
    chairFootprint: "内容により個別調整",
    staffing: "内容に応じて人確認",
    patientFacingNotes: [
      "内容確認のうえ、折り返しご案内します。",
    ],
    internalNotes: [
      "美容系、紹介、レーザー可否などは口腔内確認や人判断が前提。",
    ],
  },
];

export const EMIHA_ESCALATION_RULES: EscalationRule[] = [
  {
    id: "medical-judgement",
    when: "診断や治療可否の断定を求められたとき",
    action: "口腔内を見ないと分からない旨を伝え、人確認へ回す",
    reason: "一次受付の範囲を超えるため",
  },
  {
    id: "severe-emergency",
    when: "強い痛み、急患、当日処置要求が強いとき",
    action: "急患枠の待ち時間と応急処置中心になる可能性を案内する",
    reason: "急患初診ルールに沿うため",
  },
  {
    id: "unknown-service-line",
    when: "シートにない美容施術や紹介案件などに該当するとき",
    action: "仮受付のみ行い、院内確認後の折り返しとする",
    reason: "自動確定できないため",
  },
  {
    id: "sensitive-internal",
    when: "内部ツール、担当者連携、ログイン情報の話題になったとき",
    action: "患者向け案内に必要な範囲だけ返し、内部運用は出さない",
    reason: "秘匿すべき内部情報のため",
  },
];

export const EMIHA_REDACTION_LEDGER: string[] = [
  "SAデンタルのログインURL、メールアドレス、パスワード",
  "Google Docs や病院予約システムの内部URL",
  "個人LINE、共有LINE、グループLINE の運用手順",
  "担当者個人名に依存する内部オペレーション",
];

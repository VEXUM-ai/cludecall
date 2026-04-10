import type {
  BookingRule,
  ClinicKnowledgePack,
  ClinicProfile,
  EscalationRule,
  FaqEntry,
  KnowledgeFact,
  KnowledgeSource,
  OperationalOverride,
  PatientOpsRules,
  ServiceLineDefinition,
  ServiceMenuMapping,
} from "@/lib/types";

export const EMIHA_KNOWLEDGE_VERSION = "emiha-2026-04-09";

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

export const EMIHA_KNOWLEDGE_SOURCES: KnowledgeSource[] = [
  {
    id: "emiha-public-site",
    label: "えみは総合歯科 公開サイト",
    kind: "public_site",
    visibility: "patient_facing",
    url: "https://umeda-emihadc.com/",
    approvedByClient: true,
    reviewedAt: "2026-04-06",
    sourceCheckedAt: "2026-04-06",
    notes: "患者向け公開情報の基準値。",
  },
  {
    id: "emiha-client-sheet",
    label: "先方シート / 現場ルール",
    kind: "client_sheet",
    visibility: "internal_only",
    url: null,
    approvedByClient: true,
    reviewedAt: "2026-04-06",
    sourceCheckedAt: "2026-04-06",
    notes: "予約制約、メニュー運用、例外対応の基準値。",
  },
  {
    id: "cludecall-retell-script",
    label: "先方 Retell 会話フロー",
    kind: "manual_script",
    visibility: "internal_only",
    url: "https://github.com/kato4096/cludecall",
    approvedByClient: false,
    reviewedAt: "2026-04-09",
    sourceCheckedAt: "2026-04-09",
    notes: "会話段取りと post-call analysis 項目の参照実装。",
  },
  {
    id: "emiha-derived-runtime-rules",
    label: "統合アプリ用 正規化ルール",
    kind: "derived_rule",
    visibility: "internal_only",
    url: null,
    approvedByClient: true,
    reviewedAt: "2026-04-09",
    sourceCheckedAt: "2026-04-09",
    notes: "患者向け発話と staff review のために整形したルール。",
  },
];

export const EMIHA_APPROVED_FACTS: KnowledgeFact[] = [
  {
    id: "clinic-name",
    field: "clinicName",
    label: "医院名",
    value: EMIHA_CLINIC_PROFILE.clinicName,
    visibility: "patient_facing",
    sourceId: "emiha-public-site",
    approvedByClient: true,
    reviewedAt: "2026-04-06",
    conflictWithPublic: false,
    notes: null,
  },
  {
    id: "business-hours",
    field: "businessHours",
    label: "診療時間",
    value: EMIHA_CLINIC_PROFILE.businessHours,
    visibility: "patient_facing",
    sourceId: "emiha-public-site",
    approvedByClient: true,
    reviewedAt: "2026-04-06",
    conflictWithPublic: false,
    notes: "患者向け案内はこの値を優先する。",
  },
  {
    id: "closed-days",
    field: "closedDays",
    label: "休診日",
    value: EMIHA_CLINIC_PROFILE.closedDays,
    visibility: "patient_facing",
    sourceId: "emiha-public-site",
    approvedByClient: true,
    reviewedAt: "2026-04-06",
    conflictWithPublic: false,
    notes: null,
  },
  {
    id: "reservation-policy",
    field: "reservationPolicy",
    label: "予約ポリシー",
    value: EMIHA_CLINIC_PROFILE.reservationPolicy,
    visibility: "patient_facing",
    sourceId: "emiha-derived-runtime-rules",
    approvedByClient: true,
    reviewedAt: "2026-04-09",
    conflictWithPublic: false,
    notes: "予約確定を AI が約束しないガードレール込み。",
  },
  {
    id: "first-visit-arrival",
    field: "firstVisitArrivalNote",
    label: "初診来院案内",
    value: EMIHA_CLINIC_PROFILE.firstVisitArrivalNote,
    visibility: "patient_facing",
    sourceId: "emiha-client-sheet",
    approvedByClient: true,
    reviewedAt: "2026-04-06",
    conflictWithPublic: true,
    notes: "患者向け案内として承認済み。",
  },
  {
    id: "same-day-policy",
    field: "sameDayPolicy",
    label: "急患案内",
    value: EMIHA_CLINIC_PROFILE.sameDayPolicy,
    visibility: "patient_facing",
    sourceId: "emiha-client-sheet",
    approvedByClient: true,
    reviewedAt: "2026-04-06",
    conflictWithPublic: true,
    notes: null,
  },
];

export const EMIHA_OPERATIONAL_OVERRIDES: OperationalOverride[] = [
  {
    id: "legacy-retell-business-hours",
    field: "businessHours",
    sourceId: "cludecall-retell-script",
    visibility: "internal_only",
    patientFacingValue: EMIHA_CLINIC_PROFILE.businessHours,
    internalValue: "月〜土 9:30〜18:00（日・祝休診）",
    approvedByClient: false,
    reviewedAt: "2026-04-09",
    reason: "先方サンプル実装の旧値。患者向けには使わない。",
  },
  {
    id: "legacy-retell-clinic-name",
    field: "clinicName",
    sourceId: "cludecall-retell-script",
    visibility: "internal_only",
    patientFacingValue: EMIHA_CLINIC_PROFILE.clinicName,
    internalValue: "えみは総合歯科",
    approvedByClient: false,
    reviewedAt: "2026-04-09",
    reason: "先方サンプルは院名が短縮表記。患者向け UI / prompt では正式院名を使う。",
  },
];

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

export const EMIHA_PATIENT_OPS_RULES: PatientOpsRules = {
  bookingPromisePolicy: "AI は live 通話中に予約確定を約束せず、仮受付として締める。",
  callbackPolicy: "院内確認後に必要があれば折り返し連絡する。",
  unresolvedInquiryPolicy:
    "同一項目の確認は 2 回までに留め、解決しない場合は unresolved_questions に残して review に回す。",
  firstVisitArrivalLeadMinutes: 10,
  lineFormArrivalLeadMinutes: 15,
  sameDayGuidance:
    "急患や強い痛みは電話優先案内に寄せ、空き状況の断定はせず当日案内の可能性のみ伝える。",
};

export const EMIHA_SERVICE_LINE_DEFINITIONS: ServiceLineDefinition[] = [
  {
    serviceLine: "general_initial",
    label: "通常初診",
    patientSummary: "通常の初診相談。検査中心で必要時のみ応急処置。",
    urgencySignals: [],
    escalationTriggers: [],
    allowedInLiveCall: true,
  },
  {
    serviceLine: "emergency_initial",
    label: "急患初診",
    patientSummary: "強い痛みや腫れなどで当日案内が必要なケース。",
    urgencySignals: ["強い痛み", "ズキズキ", "腫れ", "出血", "夜眠れない"],
    escalationTriggers: ["当日電話優先", "応急処置のみになる可能性"],
    allowedInLiveCall: false,
  },
  {
    serviceLine: "implant_consult",
    label: "インプラント相談",
    patientSummary: "検査後説明が前提。ドクター確認必須。",
    urgencySignals: [],
    escalationTriggers: ["担当ドクター必須", "自動確定しない"],
    allowedInLiveCall: true,
  },
  {
    serviceLine: "thp_pretest",
    label: "THP事前検査",
    patientSummary: "90分3枠の事前検査。衛生士対応が可能。",
    urgencySignals: [],
    escalationTriggers: ["担当衛生士のブロック確認"],
    allowedInLiveCall: true,
  },
  {
    serviceLine: "free_screening",
    label: "無料歯科検診",
    patientSummary: "審査診断まで無料。治療希望有無で所要時間が変わる。",
    urgencySignals: [],
    escalationTriggers: ["当日治療希望か要確認"],
    allowedInLiveCall: true,
  },
  {
    serviceLine: "whitening",
    label: "ホワイトニング",
    patientSummary: "専用機材 1 台のため重複制御が必要。",
    urgencySignals: [],
    escalationTriggers: ["機材 1 台", "自動確定しない"],
    allowedInLiveCall: true,
  },
  {
    serviceLine: "invisalign",
    label: "インビザライン",
    patientSummary: "内容により時間が変動。担当ドクター確認必須。",
    urgencySignals: [],
    escalationTriggers: ["担当ドクター必須", "内容別に所要時間が変わる"],
    allowedInLiveCall: true,
  },
  {
    serviceLine: "other_manual_review",
    label: "個別確認案件",
    patientSummary: "美容系や紹介案件など、人確認が前提の問い合わせ。",
    urgencySignals: [],
    escalationTriggers: ["院内確認後に折り返し"],
    allowedInLiveCall: true,
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
    internalNotes: ["機械1台のため重ね取り不可。"],
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
    patientFacingNotes: ["内容確認のうえ、折り返しご案内します。"],
    internalNotes: [
      "美容系、紹介、レーザー可否などは口腔内確認や人判断が前提。",
    ],
  },
];

export const EMIHA_SERVICE_MENU_MAPPINGS: ServiceMenuMapping[] = [
  {
    serviceLine: "general_initial",
    apotoolMenuPrimary: "初診   (60分)",
    apotoolMenuSecondary: "治療前TC",
    bookingPattern: "tc30_and_treatment60",
    automationPolicy: "rpa_supported",
    notes: ["RPA v1 対応対象。TC30分 + 初診60分の連続枠で投入する。"],
  },
  {
    serviceLine: "emergency_initial",
    apotoolMenuPrimary: "初診   (60分)",
    apotoolMenuSecondary: "治療前TC",
    bookingPattern: "tc30_and_treatment60",
    automationPolicy: "manual_review_only",
    notes: ["急患初診は Apotool 自動投入の対象外です。通話中にスタッフへ電話転送する前提です。"],
  },
  {
    serviceLine: "implant_consult",
    apotoolMenuPrimary: null,
    apotoolMenuSecondary: null,
    bookingPattern: "manual_only",
    automationPolicy: "manual_review_only",
    notes: ["担当ドクターと追加確認が必要。"],
  },
  {
    serviceLine: "thp_pretest",
    apotoolMenuPrimary: null,
    apotoolMenuSecondary: null,
    bookingPattern: "manual_only",
    automationPolicy: "manual_review_only",
    notes: ["3枠 / 90分対応のため v1 RPA 対象外。"],
  },
  {
    serviceLine: "free_screening",
    apotoolMenuPrimary: "初診   (60分)",
    apotoolMenuSecondary: "無料歯科検診",
    bookingPattern: "manual_only",
    automationPolicy: "manual_review_only",
    notes: ["当日治療希望有無で時間が変わるため v1 は手動。"],
  },
  {
    serviceLine: "whitening",
    apotoolMenuPrimary: null,
    apotoolMenuSecondary: null,
    bookingPattern: "manual_only",
    automationPolicy: "manual_review_only",
    notes: ["専用機材1台のため手動確認を維持する。"],
  },
  {
    serviceLine: "invisalign",
    apotoolMenuPrimary: null,
    apotoolMenuSecondary: null,
    bookingPattern: "manual_only",
    automationPolicy: "manual_review_only",
    notes: ["担当ドクター必須。"],
  },
  {
    serviceLine: "other_manual_review",
    apotoolMenuPrimary: null,
    apotoolMenuSecondary: null,
    bookingPattern: "manual_only",
    automationPolicy: "manual_review_only",
    notes: ["内容に応じて院内判断。"],
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
    action: "急患枠の待ち時間と応急処置中心になる可能性を案内し、通話中にスタッフへつなぐ",
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

export const EMIHA_KNOWLEDGE_PACK: ClinicKnowledgePack = {
  version: EMIHA_KNOWLEDGE_VERSION,
  publicProfile: EMIHA_CLINIC_PROFILE,
  patientFaqEntries: EMIHA_FAQ_ENTRIES,
  patientOpsRules: EMIHA_PATIENT_OPS_RULES,
  bookingRules: EMIHA_BOOKING_RULES,
  serviceLineDefinitions: EMIHA_SERVICE_LINE_DEFINITIONS,
  menuMappings: EMIHA_SERVICE_MENU_MAPPINGS,
  escalationRules: EMIHA_ESCALATION_RULES,
  redactionRules: EMIHA_REDACTION_LEDGER,
  factSources: EMIHA_KNOWLEDGE_SOURCES,
  approvedFacts: EMIHA_APPROVED_FACTS,
  operationalOverrides: EMIHA_OPERATIONAL_OVERRIDES,
};

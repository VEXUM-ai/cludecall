export type RagEvalPattern =
  | {
      type: "includes";
      value: string;
    }
  | {
      type: "regex";
      value: string;
      flags?: string;
    };

export type RagEvalCase = {
  id: string;
  description: string;
  userMessage: string;
  maxTurns?: number;
  expectedKnowledgeDocs: string[];
  requiredPatterns: RagEvalPattern[];
  forbiddenPatterns?: RagEvalPattern[];
  critical?: boolean;
};

export const RAG_EVAL_PASS_THRESHOLD = 0.88;
export const RAG_EVAL_CRITICAL_THRESHOLD = 1;

export const RAG_EVAL_CASES: RagEvalCase[] = [
  {
    id: "hours-holidays",
    description: "診療時間、休診日、土日祝診療を1回で答えられる",
    userMessage: "診療時間と休診日を教えてください。土日祝も診療していますか。",
    expectedKnowledgeDocs: ["emiha-hours-holidays"],
    requiredPatterns: [
      { type: "regex", value: "10:00-18:00|午前十時から午後六時まで|10時から18時|十時から十八時まで" },
      { type: "includes", value: "年末年始" },
      { type: "includes", value: "土日祝" },
    ],
    critical: true,
  },
  {
    id: "access-location",
    description: "所在地と最寄り駅をまとめて答えられる",
    userMessage: "どこにありますか。最寄り駅も教えてください。",
    expectedKnowledgeDocs: ["emiha-access-location"],
    requiredPatterns: [
      {
        type: "regex",
        value:
          "グ\\s*ラングリーン大阪(?:ショップ(?:&|アンド)レストラン)?\\s*北館(?:2F|二階)",
      },
      { type: "includes", value: "JR大阪駅" },
    ],
  },
  {
    id: "parking-basic",
    description: "駐車場の有無を短く答えられる",
    userMessage: "駐車場はありますか。",
    expectedKnowledgeDocs: ["emiha-parking"],
    requiredPatterns: [{ type: "includes", value: "大型駐車場" }],
  },
  {
    id: "parking-unsupported-details",
    description: "未確認の駐車台数を断定せずに答えられる",
    userMessage: "駐車場は何台停められますか。",
    expectedKnowledgeDocs: ["emiha-parking"],
    requiredPatterns: [
      { type: "includes", value: "大型駐車場" },
      { type: "regex", value: "スタッフ確認|スタッフにお尋ね|確定していない|確認できません" },
    ],
    forbiddenPatterns: [{ type: "regex", value: "[0-9０-９]+台" }],
    critical: true,
  },
  {
    id: "visit-preparation-arrival",
    description: "初診の基本来院時間と完全予約制を答えられる",
    userMessage: "初診は何分前に行けばいいですか。完全予約制ですか。",
    expectedKnowledgeDocs: ["emiha-visit-preparation"],
    requiredPatterns: [
      { type: "regex", value: "10分前|十分前" },
      { type: "includes", value: "完全予約制" },
    ],
    critical: true,
  },
  {
    id: "line-questionnaire-timing",
    description: "LINE問診の事前回答と未回答時の15分前案内を答えられる",
    userMessage: "LINE問診はいつまでにやればいいですか。まだ回答していない場合は何分前に行けばいいですか。",
    expectedKnowledgeDocs: ["emiha-visit-preparation"],
    requiredPatterns: [
      { type: "includes", value: "来院前" },
      { type: "regex", value: "15分前|十五分前" },
    ],
    critical: true,
  },
  {
    id: "line-questionnaire-procedure-unsupported",
    description: "LINE問診の具体操作が未確認であることを案内できる",
    userMessage: "LINE問診は事前にどうやって回答すればいいですか。",
    expectedKnowledgeDocs: ["emiha-visit-preparation"],
    requiredPatterns: [
      { type: "regex", value: "確定していない|スタッフ確認" },
      { type: "includes", value: "LINE問診" },
    ],
    critical: true,
  },
  {
    id: "visit-preparation-combined",
    description: "初診10分前とLINE未回答15分前を言い分けられる",
    userMessage: "初診の基本の来院時間と、LINE問診が未回答のときの来院時間をまとめて教えてください。",
    expectedKnowledgeDocs: ["emiha-visit-preparation"],
    requiredPatterns: [
      { type: "regex", value: "10分前|十分前" },
      { type: "regex", value: "15分前|十五分前" },
    ],
    critical: true,
  },
  {
    id: "free-screening",
    description: "無料歯科検診の無料範囲と通常費用を答えられる",
    userMessage: "無料歯科検診って、どこまで無料ですか。治療は別料金ですか。",
    expectedKnowledgeDocs: ["emiha-free-screening"],
    requiredPatterns: [
      { type: "includes", value: "審査診断まで" },
      { type: "includes", value: "通常費用" },
    ],
  },
  {
    id: "thp-pretest",
    description: "THP事前検査の時間、費用、対応者を答えられる",
    userMessage: "THP事前検査の時間と費用を教えてください。ドクター不在でも対応できますか。",
    expectedKnowledgeDocs: ["emiha-thp-pretest"],
    requiredPatterns: [
      { type: "regex", value: "90分3枠|九十分三枠" },
      { type: "regex", value: "9,500円|9500円|九千五百円" },
      { type: "includes", value: "歯科衛生士対応" },
    ],
  },
  {
    id: "multi-topic-hours-access",
    description: "複数トピックを一度で答えられる",
    userMessage: "診療時間と、場所をまとめて教えてください。",
    expectedKnowledgeDocs: ["emiha-hours-holidays", "emiha-access-location"],
    requiredPatterns: [
      { type: "regex", value: "10:00-18:00|午前十時から午後六時まで|10時から18時|十時から十八時まで" },
      {
        type: "regex",
        value:
          "グ\\s*ラングリーン大阪(?:ショップ(?:&|アンド)レストラン)?\\s*北館(?:2F|二階)",
      },
    ],
    critical: true,
  },
];

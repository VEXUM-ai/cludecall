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
    description: "診療時間と休診日を同じ回答で返せる",
    userMessage:
      "診療時間と休診日を教えてください。土日も診療していますか。",
    expectedKnowledgeDocs: ["emiha-hours-holidays"],
    requiredPatterns: [
      { type: "regex", value: "10:00-18:00|10時.*18時|十時.*十八時" },
      { type: "includes", value: "年末年始" },
      { type: "includes", value: "土日" },
    ],
    critical: true,
  },
  {
    id: "access-location",
    description: "場所とアクセスを患者向け表現で返せる",
    userMessage:
      "場所はどこですか。JR大阪駅から分かりやすい言い方で教えてください。",
    expectedKnowledgeDocs: ["emiha-access-location"],
    requiredPatterns: [
      { type: "includes", value: "グラングリーン大阪" },
      { type: "includes", value: "JR大阪駅直結" },
    ],
    critical: true,
  },
  {
    id: "parking-basic",
    description: "駐車場の有無を答え、未確認の細部は断定しない",
    userMessage:
      "駐車場はありますか。台数までは分からなければそのままで大丈夫です。",
    expectedKnowledgeDocs: ["emiha-parking"],
    requiredPatterns: [
      { type: "includes", value: "大型駐車場" },
      { type: "regex", value: "台数.*(確定していない|スタッフ確認)|必要ならスタッフ確認" },
    ],
  },
  {
    id: "visit-preparation-arrival",
    description: "初診の来院時間を返せる",
    userMessage:
      "初診は何分前に行けばいいですか。",
    expectedKnowledgeDocs: ["emiha-visit-preparation"],
    requiredPatterns: [
      { type: "includes", value: "初診" },
      { type: "regex", value: "10分前|十分前" },
    ],
    critical: true,
  },
  {
    id: "line-questionnaire-timing",
    description: "LINE問診未回答時は15分前案内にできる",
    userMessage:
      "LINE問診がまだできていません。その場合は何分前に行けばいいですか。",
    expectedKnowledgeDocs: ["emiha-visit-preparation"],
    requiredPatterns: [
      { type: "includes", value: "LINE問診" },
      { type: "regex", value: "15分前|十五分前" },
    ],
    critical: true,
  },
  {
    id: "arrival-location-support",
    description: "場所が不安な人への20分前案内を返せる",
    userMessage:
      "場所が少し不安です。グラングリーン大阪は何となく分かるのですが、早めに行った方がいいですか。",
    expectedKnowledgeDocs: ["emiha-arrival-location-support"],
    requiredPatterns: [
      { type: "regex", value: "20分前|二十分前" },
      { type: "includes", value: "グラングリーン大阪" },
    ],
  },
  {
    id: "free-screening-detailed",
    description: "無料歯科検診の無料範囲、web問診不要、保険証確認を返せる",
    userMessage:
      "無料歯科検診ってどこまで無料ですか。初診web問診は必要ですか。保険証やマイナ保険証も持って行くんでしょうか。",
    expectedKnowledgeDocs: ["emiha-free-screening"],
    requiredPatterns: [
      { type: "includes", value: "審査診断まで" },
      { type: "regex", value: "初診web問診.*不要|web問診.*不要" },
      { type: "regex", value: "保険証|マイナ保険証" },
      { type: "regex", value: "個別.*確認|スタッフ確認" },
    ],
    critical: true,
  },
  {
    id: "thp-pretest",
    description: "THP術前検査の所要時間と費用を返せる",
    userMessage:
      "THPの術前検査って何分くらいで、いくらですか。",
    expectedKnowledgeDocs: ["emiha-thp-pretest"],
    requiredPatterns: [
      { type: "regex", value: "90分|九十分" },
      { type: "regex", value: "9,500円|9500円|九千五百円" },
    ],
  },
  {
    id: "halitosis-test",
    description: "口臭検査の注意事項を返せる",
    userMessage:
      "口臭検査の前って何か気をつけることありますか。食事やマウスウォッシュも含めて教えてください。",
    expectedKnowledgeDocs: ["emiha-halitosis-test"],
    requiredPatterns: [
      { type: "regex", value: "2時間前|二時間前" },
      { type: "regex", value: "強いにおい|においの強い" },
      { type: "includes", value: "マウスウォッシュ" },
    ],
    critical: true,
  },
  {
    id: "implant-consult-followup",
    description: "インプラントの詳細は個別確認と返せる",
    userMessage:
      "インプラント相談の次の流れって電話で決まりますか。鎮静とか支払いのことも今分かりますか。",
    expectedKnowledgeDocs: ["emiha-implant-consult"],
    requiredPatterns: [
      { type: "regex", value: "スタッフ|ドクター" },
      { type: "includes", value: "鎮静" },
      { type: "regex", value: "支払い|帰宅手段|個別確認" },
    ],
  },
  {
    id: "referral-followup",
    description: "紹介関連は具体名を断定せずスタッフ確認へ回せる",
    userMessage:
      "紹介状があるのですが、どこの病院になるか今わかりますか。予約方法も教えてください。",
    expectedKnowledgeDocs: ["emiha-referral-followup"],
    requiredPatterns: [
      { type: "regex", value: "スタッフ確認|確認のうえ|確認できません" },
      { type: "regex", value: "断定しない|電話の時点では.*決められない|内容によって変わる" },
    ],
    forbiddenPatterns: [
      { type: "regex", value: "大阪歯科大学|メディグル" },
    ],
  },
  {
    id: "service-faq-wisdom-tooth",
    description: "初診当日の親知らず抜歯を約束しない",
    userMessage:
      "初診の日にそのまま親知らず抜歯までできますか。",
    expectedKnowledgeDocs: ["emiha-service-faq"],
    requiredPatterns: [
      { type: "includes", value: "親知らず" },
      { type: "regex", value: "初診当日.*案内していません|その場ではご案内していません|口の中を見てから" },
    ],
  },
  {
    id: "multi-topic-hours-access",
    description: "診療時間と場所の複数FAQを一度に返せる",
    userMessage:
      "診療時間と場所をまとめて教えてください。",
    expectedKnowledgeDocs: ["emiha-hours-holidays", "emiha-access-location"],
    requiredPatterns: [
      { type: "regex", value: "10:00-18:00|10時.*18時|十時.*十八時" },
      { type: "includes", value: "グラングリーン大阪" },
    ],
    critical: true,
  },
];

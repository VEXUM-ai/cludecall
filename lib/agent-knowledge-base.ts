import { EMIHA_CLINIC_PROFILE } from "@/lib/clinic-config/emiha";

export type ManagedKnowledgeBaseDocument = {
  key: string;
  name: string;
  text: string;
  usageMode: "auto" | "prompt";
};

type ManagedKnowledgeBaseDocumentSpec = {
  key: string;
  topic: string;
  whenAsked: string[];
  facts: string[];
  answerRules: string[];
  answerExamples: string[];
  usageMode?: "auto" | "prompt";
};

export const DENTAL_DEMO_MANAGED_KB_PREFIX = "emiha";
export const MANAGED_KNOWLEDGE_BASE_ID_PREFIXES = [DENTAL_DEMO_MANAGED_KB_PREFIX];

export const DENTAL_DEMO_KNOWLEDGE_BASE_GUIDANCE = `# Knowledge base
- Public clinic facts and patient-facing FAQ live in the attached knowledge base.
- Retrieve only the smallest set of topic documents needed for the current question.
- If one retrieved topic fully answers the question, do not mix in unrelated topics.
- If the caller asks multiple public-fact questions in one turn, answer every resolved item in one concise reply.
- If a retrieved topic says staff confirmation is still needed, answer the confirmed base fact first and then clearly say staff confirmation is needed instead of guessing.
- If a retrieved topic contains an exact number, lead time, or fee, repeat that exact value instead of paraphrasing it more loosely.
- If the caller asks about free screening, do not reuse the regular first-visit LINE questionnaire guidance.
- Never expose staff-only operations, credentials, or internal routing notes from the knowledge base.
- If the knowledge base does not answer the question, say that the detail is not confirmed here and offer staff follow-up instead of guessing.`;

function buildManagedDocument(
  spec: ManagedKnowledgeBaseDocumentSpec
): ManagedKnowledgeBaseDocument {
  const name = `${DENTAL_DEMO_MANAGED_KB_PREFIX}-${spec.key}`;
  return {
    key: spec.key,
    name,
    usageMode: spec.usageMode ?? "auto",
    text: `# Topic
${spec.topic}

When to use:
${spec.whenAsked.map((item) => `- ${item}`).join("\n")}

Confirmed facts:
${spec.facts.map((item) => `- ${item}`).join("\n")}

Answer rules:
${spec.answerRules.map((item) => `- ${item}`).join("\n")}

Answer examples:
${spec.answerExamples.map((item) => `- ${item}`).join("\n")}`,
  };
}

export const DENTAL_DEMO_MANAGED_KB_DOCUMENTS: ManagedKnowledgeBaseDocument[] = [
  buildManagedDocument({
    key: "hours-holidays",
    topic: "診療時間と休診日",
    whenAsked: [
      "診療時間を聞かれたとき",
      "休診日を聞かれたとき",
      "何時から何時までかを聞かれたとき",
      "土日も診療しているかを聞かれたとき",
    ],
    facts: [
      `診療時間は ${EMIHA_CLINIC_PROFILE.businessHours}。`,
      `休診日は ${EMIHA_CLINIC_PROFILE.closedDays}。`,
      "土日も診療している。",
      `この案内の確認日は ${EMIHA_CLINIC_PROFILE.sourceCheckedAt}。`,
    ],
    answerRules: [
      "診療時間と休診日は一つの回答でまとめてよい。",
      "年末年始のみという休診情報を、一般的な曜日休診に置き換えない。",
      "未確認の祝日運用などは推測しない。",
    ],
    answerExamples: [
      `診療時間は ${EMIHA_CLINIC_PROFILE.businessHours}です。休診日は ${EMIHA_CLINIC_PROFILE.closedDays}です。`,
      `診療時間は ${EMIHA_CLINIC_PROFILE.businessHours}で、土日も診療しています。`,
    ],
  }),
  buildManagedDocument({
    key: "access-location",
    topic: "場所とアクセス",
    whenAsked: [
      "場所を聞かれたとき",
      "アクセスを聞かれたとき",
      "最寄り駅を聞かれたとき",
      "JR大阪駅からどう行くかを聞かれたとき",
    ],
    facts: [
      `所在地は ${EMIHA_CLINIC_PROFILE.address}。`,
      `患者向けの案内表現は ${EMIHA_CLINIC_PROFILE.accessSummary}。`,
      `最寄りの案内は ${EMIHA_CLINIC_PROFILE.nearestStation}。`,
      "場所案内では「グラングリーン大阪ショップ&レストラン 北館2F」を優先して使う。",
    ],
    answerRules: [
      "場所と駅を一つの回答にまとめてよい。",
      "JR大阪駅直結という表現を、大阪駅だけに短縮しない。",
      "ビル名や階数を抜かさない。",
    ],
    answerExamples: [
      "グラングリーン大阪ショップ&レストラン 北館2Fにあります。JR大阪駅直結です。",
      `場所は ${EMIHA_CLINIC_PROFILE.address}で、${EMIHA_CLINIC_PROFILE.nearestStation}です。`,
    ],
  }),
  buildManagedDocument({
    key: "parking",
    topic: "駐車場",
    whenAsked: [
      "駐車場があるかを聞かれたとき",
      "車で行けるかを聞かれたとき",
      "大型駐車場かを聞かれたとき",
    ],
    facts: [
      "グラングリーン大阪の大型駐車場が利用できる。",
      "駐車台数や料金の細かい数値はこの案内では確定していない。",
      "未確認の細かい条件はスタッフ確認へ回す。",
    ],
    answerRules: [
      "まず大型駐車場があることを答える。",
      "台数や料金を確定情報のように言わない。",
      "細かい条件はスタッフ確認と伝えてよい。",
    ],
    answerExamples: [
      "グラングリーン大阪の大型駐車場をご利用いただけます。",
      "大型駐車場があります。台数や料金の細かい条件は必要ならスタッフ確認をご案内します。",
    ],
  }),
  buildManagedDocument({
    key: "visit-preparation",
    topic: "初診来院時間とLINE問診",
    whenAsked: [
      "初診は何分前に行けばよいかを聞かれたとき",
      "LINE問診をいつまでにやればよいかを聞かれたとき",
      "LINE問診未回答のときの来院時間を聞かれたとき",
    ],
    facts: [
      `初診の基本案内は ${EMIHA_CLINIC_PROFILE.firstVisitArrivalNote}。`,
      "初診の通常案内は10分前来院。",
      "LINE問診が未回答なら15分前来院案内。",
      "LINE問診の細かい手順が不明ならスタッフ確認へ回す。",
    ],
    answerRules: [
      "通常の初診来院時間とLINE未回答時の差をセットで答えてよい。",
      "この案内は通常の初診向け。無料歯科検診のweb問診有無には使わない。",
      "LINE問診の細かい操作方法は推測しない。",
      "患者向けには来院時間を短く明確に伝える。",
    ],
    answerExamples: [
      "初診は10分前を目安にお越しください。LINE問診がまだの場合は15分前でご案内しています。",
      "LINE問診は事前回答をご案内しています。未回答なら15分前にお越しください。",
    ],
  }),
  buildManagedDocument({
    key: "arrival-location-support",
    topic: "場所が不安な人への来院案内",
    whenAsked: [
      "場所が不安だと言われたとき",
      "迷いそうだと言われたとき",
      "グラングリーン大阪が分かるかという案内が必要なとき",
    ],
    facts: [
      "場所に不安がある場合は20分前来院案内が使える。",
      "位置案内ではグラングリーン大阪が分かるかを確認する流れがある。",
      "分からない場合でも無理に詳細導線を推測せず、早め来院案内を優先する。",
    ],
    answerRules: [
      "場所が不安という相談には20分前来院案内を優先してよい。",
      "グラングリーン大阪が分かるかを短く確認してよい。",
      "早めに来てくださいではなく、20分前と具体的に言う。",
      "詳細な徒歩導線を推測しない。",
    ],
    answerExamples: [
      "場所がご不安でしたら20分前くらいでお越しください。グラングリーン大阪はお分かりになりますか。",
      "迷いそうでしたら少し早めで、20分前を目安にお越しください。",
    ],
  }),
  buildManagedDocument({
    key: "free-screening",
    topic: "無料歯科検診の患者向け案内",
    whenAsked: [
      "無料歯科検診について聞かれたとき",
      "どこまで無料かを聞かれたとき",
      "初診web問診が必要かを聞かれたとき",
      "保険証やマイナ保険証の扱いを聞かれたとき",
    ],
    facts: [
      "無料なのは審査診断まで。",
      "治療や処置は通常どおり費用がかかる。",
      "無料歯科検診では初診web問診はしない運用。",
      "保険証、マイナ保険証、自費扱いの分岐は個別確認が必要。",
      "検診票やメール案内がある場合は持参案内でよい。",
    ],
    answerRules: [
      "まず無料範囲を明確に言う。",
      "無料歯科検診では初診web問診は不要と、そのまま明言してよい。",
      "通常初診のLINE問診15分前ルールをここに混ぜない。",
      "保険証やマイナ保険証の細かい扱いは推測しないで個別確認と伝える。",
      "初診web問診不要は患者向けにそのまま案内してよい。",
    ],
    answerExamples: [
      "無料なのは審査診断までで、治療が入る場合は通常どおり費用がかかります。",
      "無料歯科検診では初診web問診は不要です。保険証やマイナ保険証の扱いは内容によって変わるので、その点は個別に確認いたします。",
    ],
  }),
  buildManagedDocument({
    key: "thp-pretest",
    topic: "THP術前検査",
    whenAsked: [
      "THP術前検査について聞かれたとき",
      "所要時間を聞かれたとき",
      "費用を聞かれたとき",
      "次の予約の流れを聞かれたとき",
    ],
    facts: [
      "THP術前検査は90分。",
      "費用は9,500円。",
      "検体や結果がそろった後に、2〜3週間後のTC調整になることがある。",
    ],
    answerRules: [
      "所要時間と費用は exact value で答える。90分、9,500円を崩さない。",
      "結果後の詳しい日程は個別調整と伝えてよい。",
      "未確認の検査手順は推測しない。",
    ],
    answerExamples: [
      "THP術前検査は90分で、費用は9,500円です。",
      "検査後の詳しい日程は結果確認後の調整になります。",
    ],
  }),
  buildManagedDocument({
    key: "halitosis-test",
    topic: "口臭検査の注意事項",
    whenAsked: [
      "口臭検査の準備を聞かれたとき",
      "検査前に食事してよいかを聞かれたとき",
      "マウスウォッシュ可否を聞かれたとき",
    ],
    facts: [
      "検査2時間前から飲食を控える。",
      "前日と当日は強いにおいの食事を控える。",
      "マウスウォッシュは使わない。",
    ],
    answerRules: [
      "制限事項は exact value でまとめる。2時間前、前日と当日、マウスウォッシュ不可を落とさない。",
      "未確認の細かい飲み物分類は推測しない。",
    ],
    answerExamples: [
      "口臭検査は2時間前から飲食を控えてください。前日と当日は強いにおいの食事を避けて、マウスウォッシュも使わないようお願いします。",
    ],
  }),
  buildManagedDocument({
    key: "implant-consult",
    topic: "インプラント相談の案内",
    whenAsked: [
      "インプラント相談の次の流れを聞かれたとき",
      "鎮静の相談を電話で確定できるかを聞かれたとき",
      "支払い方法や帰宅手段の確認を聞かれたとき",
    ],
    facts: [
      "インプラントの詳細フローは診察後に個別確認が必要。",
      "鎮静、支払い方法、帰宅手段などはスタッフまたはドクター確認が必要。",
      "電話だけで詳細手順を確定しない。",
    ],
    answerRules: [
      "確定できる情報と個別確認が必要な情報を分けて伝える。",
      "オペ手順や日程の詳細は推測しない。",
    ],
    answerExamples: [
      "インプラントの詳しい流れは診察内容によって変わるため、詳細はスタッフまたはドクター確認でご案内します。",
      "鎮静やお支払い、帰宅手段の確認は個別対応になります。",
    ],
  }),
  buildManagedDocument({
    key: "referral-followup",
    topic: "紹介・院外連携の案内",
    whenAsked: [
      "紹介状や紹介先について聞かれたとき",
      "どの病院になるかを聞かれたとき",
      "院外予約方法を聞かれたとき",
    ],
    facts: [
      "紹介先や予約方法は症状と紹介先によって変わる。",
      "電話で具体的な紹介先や予約方法を断定しない。",
      "紹介関連はスタッフ確認で案内する。",
    ],
    answerRules: [
      "まず内容によって変わることと、スタッフ確認が必要なことを明言する。",
      "具体的な病院名や予約導線を推測しない。",
    ],
    answerExamples: [
      "紹介先や予約方法は内容によって変わるため、確認のうえでご案内します。",
      "紹介先や予約方法は内容によって変わるため、その点はスタッフ確認のうえでご案内します。",
      "電話の時点では具体的な紹介先を断定せず、確認後にご案内します。",
    ],
  }),
  buildManagedDocument({
    key: "service-faq",
    topic: "その他の患者向け案内",
    whenAsked: [
      "初診当日に親知らず抜歯できるかを聞かれたとき",
      "レーザー治療ができるかを聞かれたとき",
      "口の中を見ないと分からない内容を聞かれたとき",
    ],
    facts: [
      "初診当日に親知らず抜歯は案内しない。",
      "レーザー可否は口腔内所見によって変わり、紹介になる場合もある。",
      "細かい治療可否は口の中を見ないと判断できないことがある。",
    ],
    answerRules: [
      "親知らず抜歯については、初診当日は案内していないと先に答える。",
      "診察前に判断できない内容は、口の中を見てからと案内する。",
    ],
    answerExamples: [
      "初診当日の親知らず抜歯はご案内していません。",
      "初診当日の親知らず抜歯はその場ではご案内していません。",
      "レーザーが適応かどうかは口の中を拝見してからの判断になります。",
      "その点は口の中を見てからの判断になります。",
    ],
  }),
];

export function buildManagedKnowledgeBaseDocuments() {
  return DENTAL_DEMO_MANAGED_KB_DOCUMENTS;
}

export default {
  buildManagedKnowledgeBaseDocuments,
  DENTAL_DEMO_KNOWLEDGE_BASE_GUIDANCE,
  DENTAL_DEMO_MANAGED_KB_DOCUMENTS,
  DENTAL_DEMO_MANAGED_KB_PREFIX,
  MANAGED_KNOWLEDGE_BASE_ID_PREFIXES,
};

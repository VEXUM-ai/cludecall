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
- Public clinic facts and FAQ live in the attached knowledge base.
- Use only the smallest set of retrieved topic documents needed for the current public-fact question.
- If one retrieved topic already answers the question, do not mix in unrelated topics.
- If the caller asks multiple public-fact questions in one turn, answer all resolved items in one concise reply.
- If the caller asks a multi-topic question, combine the confirmed facts from every relevant retrieved topic before saying any part is unavailable.
- Prefer one complete sentence per fact. Do not split a factual answer across multiple short fragments.
- If a retrieved document says a detail is not confirmed, first answer the confirmed base fact, then say the detail is not confirmed, and offer staff follow-up instead of guessing.
- If the retrieved knowledge does not answer the question, do not guess. Offer staff follow-up instead.`;

function buildManagedDocument(spec: ManagedKnowledgeBaseDocumentSpec): ManagedKnowledgeBaseDocument {
  const name = `${DENTAL_DEMO_MANAGED_KB_PREFIX}-${spec.key}`;
  return {
    key: spec.key,
    name,
    usageMode: spec.usageMode ?? "auto",
    text: `# トピック
${spec.topic}

この文書を使う質問:
${spec.whenAsked.map((item) => `- ${item}`).join("\n")}

確定している事実:
${spec.facts.map((item) => `- ${item}`).join("\n")}

回答ルール:
${spec.answerRules.map((item) => `- ${item}`).join("\n")}

回答例:
${spec.answerExamples.map((item) => `- ${item}`).join("\n")}`,
  };
}

export const DENTAL_DEMO_MANAGED_KB_DOCUMENTS: ManagedKnowledgeBaseDocument[] = [
  buildManagedDocument({
    key: "hours-holidays",
    topic: "診療時間と休診日",
    whenAsked: [
      "診療時間を知りたい",
      "営業時間を知りたい",
      "何時から何時までか知りたい",
      "休診日を知りたい",
      "土日祝も診療しているか知りたい",
      "今日やっているか知りたい",
    ],
    facts: [
      `診療時間は ${EMIHA_CLINIC_PROFILE.businessHours} です。`,
      `休診日は ${EMIHA_CLINIC_PROFILE.closedDays} です。`,
      "公開案内で確認できる休診日の案内は年末年始のみです。",
      "土日祝も通常どおり診療しています。",
      `公開情報の確認日は ${EMIHA_CLINIC_PROFILE.sourceCheckedAt} です。`,
    ],
    answerRules: [
      "診療時間、休診日、土日祝診療の3点はこの文書の内容だけで答える。",
      "休診日は必ず『年末年始のみ』を使い、水曜日など一般的な曜日休診へ置き換えない。",
      "未掲載の祝日特別営業や臨時休診は推測しない。",
      "複数質問なら一つの返答でまとめて答える。",
    ],
    answerExamples: [
      `診療時間は ${EMIHA_CLINIC_PROFILE.businessHours}、休診日は ${EMIHA_CLINIC_PROFILE.closedDays} です。土日祝も通常どおり診療しています。`,
      `診療時間は ${EMIHA_CLINIC_PROFILE.businessHours} です。休診日は ${EMIHA_CLINIC_PROFILE.closedDays} です。`,
      "診療時間は10:00-18:00です。休診日は年末年始のみです。土日祝も通常どおり診療しています。",
    ],
  }),
  buildManagedDocument({
    key: "access-location",
    topic: "アクセスと所在地",
    whenAsked: [
      "どこにあるか知りたい",
      "アクセスを知りたい",
      "住所を知りたい",
      "最寄り駅を知りたい",
      "JR大阪駅からどう行くか知りたい",
      "徒歩何分くらいか知りたい",
    ],
    facts: [
      `所在地は ${EMIHA_CLINIC_PROFILE.address} です。`,
      `アクセス案内は ${EMIHA_CLINIC_PROFILE.accessSummary}`,
      `最寄り駅は ${EMIHA_CLINIC_PROFILE.nearestStation} です。`,
      "案内で優先する施設表記は「グラングリーン大阪ショップ&レストラン 北館2F」です。",
    ],
    answerRules: [
      "場所、駅、徒歩目安はこの文書の事実だけで答える。",
      "駅ごとの細かな出口番号や館内導線は推測しない。",
      "複数質問なら所在地とアクセスを一つの返答でまとめる。",
      "施設名を答えるときは「グラングリーン大阪ショップ&レストラン 北館2F」を優先する。",
      "最寄り駅を答えるときは『JR大阪駅直結』を優先し、『大阪駅』だけに短縮しない。",
    ],
    answerExamples: [
      "JR大阪駅直結のグラングリーン大阪ショップ&レストラン 北館2Fです。阪急・阪神・大阪メトロ各線からも徒歩約10分です。",
      `所在地は ${EMIHA_CLINIC_PROFILE.address}、最寄り駅は ${EMIHA_CLINIC_PROFILE.nearestStation} です。`,
    ],
  }),
  buildManagedDocument({
    key: "parking",
    topic: "駐車場",
    whenAsked: [
      "駐車場があるか知りたい",
      "車で行けるか知りたい",
      "車で来院できるか知りたい",
      "何台停められるか知りたい",
      "提携駐車場があるか知りたい",
    ],
    facts: [
      `公開案内では ${EMIHA_CLINIC_PROFILE.parking}`,
      "確定しているのは大型駐車場があることまでです。",
      "駐車台数や料金などの細かな条件はこの文書だけでは確定していません。",
    ],
    answerRules: [
      "駐車場の有無は明確に答える。",
      "台数や料金など未確認の詳細は断定せず、必要ならスタッフ確認を案内する。",
      "台数を聞かれたら、最初に大型駐車場があることを答えてから、台数は未確認と伝える。",
      "具体的な数字はこの文書にない限り答えない。",
    ],
    answerExamples: [
      "グラングリーン大阪の大型駐車場をご利用いただけます。",
      "公開案内で確定しているのは大型駐車場があることまでです。駐車台数などの細かな条件は必要ならスタッフ確認をご案内します。",
      "大型駐車場があります。台数はこの案内では確定していないため、必要ならスタッフ確認をご案内します。",
    ],
  }),
  buildManagedDocument({
    key: "visit-preparation",
    topic: "初診準備とLINE問診",
    whenAsked: [
      "初診は何分前に行けばよいか知りたい",
      "初診の流れを知りたい",
      "完全予約制か知りたい",
      "LINE問診はいつまでにやればよいか知りたい",
      "LINE問診が未回答なら何分前に行けばよいか知りたい",
      "LINE問診の具体的な操作が知りたい",
      "問診票はいつ回答するか知りたい",
    ],
    facts: [
      `予約方針は ${EMIHA_CLINIC_PROFILE.reservationPolicy}`,
      "初診の基本案内は予約時間の10分前来院です。",
      "LINE問診は来院前の事前回答をご案内しています。",
      "LINE問診が未回答なら、当日は予約時間より15分前の来院をご案内します。",
      "LINE問診の具体的な操作手順はこの文書だけでは確定していません。",
    ],
    answerRules: [
      "初診の基本案内は10分前、LINE問診未回答時は15分前の違いを明確に言い分ける。",
      "LINE問診の具体的な操作手順は断定せず、未確認であることとスタッフ確認を案内する。",
      "質問が初診準備とLINE問診をまたぐ場合は、一つの返答で両方をまとめて答える。",
    ],
    answerExamples: [
      "完全予約制です。初診の基本案内は予約時間の10分前来院です。",
      "LINE問診は来院前の事前回答をご案内しています。まだ未回答なら当日は予約時間より15分前の来院をご案内します。",
      "LINE問診の具体的な操作手順はこの案内だけでは確定していないため、必要ならスタッフ確認をご案内します。",
      "初診の基本案内は10分前来院で、LINE問診が未回答なら15分前来院をご案内します。",
    ],
  }),
  buildManagedDocument({
    key: "free-screening",
    topic: "無料歯科検診",
    whenAsked: [
      "無料歯科検診について知りたい",
      "無料なのはどこまでか知りたい",
      "検診のあと治療費がかかるか知りたい",
      "当日治療希望で時間が変わるか知りたい",
    ],
    facts: [
      "無料なのは審査診断までです。",
      "治療や歯石取りは通常費用がかかります。",
      "当日治療希望かどうかで所要時間が変わります。",
    ],
    answerRules: [
      "無料範囲と有料範囲を分けて答える。",
      "費用の細かな金額はこの文書にない限り答えない。",
      "当日治療希望で時間が変わる点は短く添える。",
    ],
    answerExamples: [
      "無料なのは審査診断までで、治療や歯石取りは通常費用がかかります。",
      "無料歯科検診は審査診断までが無料で、当日治療希望かどうかで所要時間が変わります。",
    ],
  }),
  buildManagedDocument({
    key: "thp-pretest",
    topic: "THP事前検査",
    whenAsked: [
      "THP事前検査について知りたい",
      "THP事前検査の所要時間を知りたい",
      "THP事前検査の費用を知りたい",
      "ドクター不在でも対応できるか知りたい",
    ],
    facts: [
      "THP事前検査は90分3枠です。",
      "費用は9,500円です。",
      "ドクター不在でも歯科衛生士対応が可能です。",
    ],
    answerRules: [
      "所要時間、費用、対応者の可否を短く正確に答える。",
      "この文書にない追加費用や適応判断は推測しない。",
      "複数質問なら一つの返答でまとめる。",
    ],
    answerExamples: [
      "THP事前検査は90分3枠、費用は9,500円です。ドクター不在でも歯科衛生士対応が可能です。",
      "THP事前検査の費用は9,500円です。",
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

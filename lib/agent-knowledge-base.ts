import { EMIHA_CLINIC_PROFILE, EMIHA_FAQ_ENTRIES } from "@/lib/clinic-config/emiha";

export type ManagedKnowledgeBaseDocument = {
  key: string;
  name: string;
  text: string;
  usageMode: "auto" | "prompt";
};

export const DENTAL_DEMO_MANAGED_KB_PREFIX = "emiha";
export const MANAGED_KNOWLEDGE_BASE_ID_PREFIXES = [DENTAL_DEMO_MANAGED_KB_PREFIX];

export const DENTAL_DEMO_KNOWLEDGE_BASE_GUIDANCE = `# Knowledge base
- Public clinic facts and FAQ live in the attached knowledge base.
- Use retrieved knowledge when relevant to the caller question.
- If the caller asks multiple public-fact questions in one turn, answer all resolved items in one concise reply.
- Prefer one complete sentence per fact. Do not split a factual answer across multiple short fragments.
- If the retrieved knowledge does not answer the question, do not guess. Offer staff follow-up instead.`;

function buildFaqSection(ids: string[]) {
  return EMIHA_FAQ_ENTRIES.filter((entry) => ids.includes(entry.id))
    .map(
      (entry) =>
        `## ${entry.question}

- answer: ${entry.answer}
- tags: ${entry.tags.join(", ")}`
    )
    .join("\n\n");
}

const HOURS_AND_HOLIDAYS_TEXT = `# Business hours and holidays

Short approved facts:
- business hours: ${EMIHA_CLINIC_PROFILE.businessHours}
- closed days: ${EMIHA_CLINIC_PROFILE.closedDays}
- weekend note: 土日祝も通常どおり診療しています。
- source checked at: ${EMIHA_CLINIC_PROFILE.sourceCheckedAt}

Question variants:
- 診療時間
- 営業時間
- 何時から何時まで
- 休診日
- 土日祝も診療しているか
- 今日やっているか

Approved answers:
- 診療時間は ${EMIHA_CLINIC_PROFILE.businessHours} です。
- 休診日は ${EMIHA_CLINIC_PROFILE.closedDays} です。
- 土日祝も通常どおり診療しています。

Keep the answer direct. Do not add unsupported holiday rules.

# Related public FAQ

${buildFaqSection(["hours"])}
`;

const ACCESS_AND_LOCATION_TEXT = `# Access and location guidance

Short approved facts:
- address: ${EMIHA_CLINIC_PROFILE.address}
- access: ${EMIHA_CLINIC_PROFILE.accessSummary}
- nearest station: ${EMIHA_CLINIC_PROFILE.nearestStation}
- destination note: グラングリーン大阪ショップ&レストラン北館2Fです。

Use this document when the caller asks things like:
- アクセス
- どこにあるか
- 最寄り駅
- 行き方
- 住所

# Related public FAQ

${buildFaqSection(["access"])}
`;

const PARKING_TEXT = `# Parking guidance

Short approved facts:
- parking: ${EMIHA_CLINIC_PROFILE.parking}
- destination note: グラングリーン大阪内です。

Question variants:
- 駐車場
- 車で行けるか
- 車で来院できるか
- 何台停められるか
- 提携駐車場はあるか

Approved answers:
- グラングリーン大阪の大型駐車場をご利用いただけます。
- 公開案内で確定しているのは大型駐車場があることまでです。
- 駐車台数などの細かな条件はこの案内だけでは確定しないため、必要ならスタッフ確認をご案内します。

# Related public FAQ

${buildFaqSection(["parking"])}
`;

const FIRST_VISIT_ARRIVAL_TEXT = `# First visit arrival guidance

Short approved facts:
- reservation policy: ${EMIHA_CLINIC_PROFILE.reservationPolicy}
- first visit note: ${EMIHA_CLINIC_PROFILE.firstVisitArrivalNote}
- business hours: ${EMIHA_CLINIC_PROFILE.businessHours}

Use this document when the caller asks things like:
- 初診の流れ
- 何分前に行けばよいか
- 初診は何分前か
- 当日の流れ
- 完全予約制か

Approved answers:
- 完全予約制です。
- 初診は予約時間の10分前来院が基本です。
- 問診票記入などがあるため、余裕をもってお越しください。

# Related public FAQ

${buildFaqSection(["first-visit"])}
`;

const LINE_QUESTIONNAIRE_TEXT = `# LINE questionnaire guidance

Short approved facts:
- line questionnaire: LINE問診は来院前の事前回答をご案内しています。
- unanswered line questionnaire: まだ回答していない場合は、当日は予約時間より15分前の来院をご案内します。
- first visit baseline: 初診の基本案内は予約時間の10分前来院です。

Question variants:
- LINE問診
- LINEのアンケート
- 問診票はいつやるか
- 事前にLINEでやるのか
- 当日でもよいか
- 来院前に必要か

Approved answers:
- LINE問診は来院前の事前回答をご案内しています。
- まだ回答していない場合は、当日は予約時間より15分前の来院をご案内します。
- 初診の基本案内は予約時間の10分前来院です。

Keep the answer operational and short. Do not guess app operation details or internal workflow details.

# Related public FAQ

${buildFaqSection(["line-form", "first-visit"])}
`;

const SERVICE_FAQ_TEXT = `# Service FAQ

This document is for public questions about service categories that are safe to answer briefly.

Use this document when the caller asks things like:
- 無料歯科検診
- THP事前検査
- 検査や相談メニューの概要

Do not guess detailed treatment decisions or internal scheduling rules.
If a question requires a clinical judgment or an internal rule, offer staff follow-up instead.

# Related public FAQ

${buildFaqSection(["free-screening", "thp"])}
`;

export const DENTAL_DEMO_MANAGED_KB_DOCUMENTS: ManagedKnowledgeBaseDocument[] = [
  {
    key: "hours-holidays",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-hours-holidays`,
    text: HOURS_AND_HOLIDAYS_TEXT,
    usageMode: "auto",
  },
  {
    key: "access-location",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-access-location`,
    text: ACCESS_AND_LOCATION_TEXT,
    usageMode: "auto",
  },
  {
    key: "parking",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-parking`,
    text: PARKING_TEXT,
    usageMode: "auto",
  },
  {
    key: "first-visit-arrival",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-first-visit-arrival`,
    text: FIRST_VISIT_ARRIVAL_TEXT,
    usageMode: "auto",
  },
  {
    key: "line-questionnaire",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-line-questionnaire`,
    text: LINE_QUESTIONNAIRE_TEXT,
    usageMode: "auto",
  },
  {
    key: "service-faq",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-service-faq`,
    text: SERVICE_FAQ_TEXT,
    usageMode: "auto",
  },
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

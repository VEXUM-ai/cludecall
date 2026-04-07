import { EMIHA_CLINIC_PROFILE, EMIHA_FAQ_ENTRIES } from "@/lib/clinic-config/emiha";

export type ManagedKnowledgeBaseDocument = {
  key: string;
  name: string;
  text: string;
  usageMode: "auto" | "prompt";
};

export const DENTAL_DEMO_MANAGED_KB_PREFIX = "emiha";
export const MANAGED_KNOWLEDGE_BASE_ID_PREFIXES = [DENTAL_DEMO_MANAGED_KB_PREFIX];

export const DENTAL_DEMO_KB_SUMMARY_LINES = [
  `- 医院名: ${EMIHA_CLINIC_PROFILE.clinicName}`,
  `- 診療時間: ${EMIHA_CLINIC_PROFILE.businessHours}`,
  `- 休診日: ${EMIHA_CLINIC_PROFILE.closedDays}`,
  `- 予約制: ${EMIHA_CLINIC_PROFILE.reservationPolicy}`,
  `- 急患対応: ${EMIHA_CLINIC_PROFILE.emergencyPolicy}`,
].join("\n");

export const DENTAL_DEMO_KNOWLEDGE_BASE_GUIDANCE = `# Knowledge base
- 住所、アクセス、駐車場、FAQ の詳細は attached knowledge base を参照する
- knowledge base にない情報は推測せず、院内確認が必要だと伝える`;

const PUBLIC_FACTS_TEXT = `# 医院公開情報

- 医院名: ${EMIHA_CLINIC_PROFILE.clinicName}
- 住所: ${EMIHA_CLINIC_PROFILE.address}
- 電話番号: ${EMIHA_CLINIC_PROFILE.phoneNumber}
- 診療時間: ${EMIHA_CLINIC_PROFILE.businessHours}
- 休診日: ${EMIHA_CLINIC_PROFILE.closedDays}
- 予約制: ${EMIHA_CLINIC_PROFILE.reservationPolicy}
- 初診案内: ${EMIHA_CLINIC_PROFILE.firstVisitArrivalNote}
- 急患対応: ${EMIHA_CLINIC_PROFILE.emergencyPolicy}
- アクセス: ${EMIHA_CLINIC_PROFILE.accessSummary}
- 最寄り: ${EMIHA_CLINIC_PROFILE.nearestStation}
- 駐車場: ${EMIHA_CLINIC_PROFILE.parking}
- 公式サイト: ${EMIHA_CLINIC_PROFILE.officialSiteUrl}
- 情報確認日: ${EMIHA_CLINIC_PROFILE.sourceCheckedAt}
`;

const FAQ_TEXT = `# 患者向けFAQ

${EMIHA_FAQ_ENTRIES.map(
  (entry) =>
    `## ${entry.question}
\n- 回答: ${entry.answer}
- tags: ${entry.tags.join(", ")}`
).join("\n\n")}
`;

export const DENTAL_DEMO_MANAGED_KB_DOCUMENTS: ManagedKnowledgeBaseDocument[] = [
  {
    key: "public-facts",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-public-facts`,
    text: PUBLIC_FACTS_TEXT,
    usageMode: "auto",
  },
  {
    key: "faq",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-faq`,
    text: FAQ_TEXT,
    usageMode: "auto",
  },
];

export function buildManagedKnowledgeBaseDocuments() {
  return DENTAL_DEMO_MANAGED_KB_DOCUMENTS;
}

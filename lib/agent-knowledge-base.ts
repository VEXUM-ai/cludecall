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
  `- clinic: ${EMIHA_CLINIC_PROFILE.clinicName}`,
  `- business hours: ${EMIHA_CLINIC_PROFILE.businessHours}`,
  `- closed days: ${EMIHA_CLINIC_PROFILE.closedDays}`,
  `- reservation policy: ${EMIHA_CLINIC_PROFILE.reservationPolicy}`,
  `- emergency policy: ${EMIHA_CLINIC_PROFILE.emergencyPolicy}`,
].join("\n");

export const DENTAL_DEMO_KNOWLEDGE_BASE_GUIDANCE = `# Knowledge base
- Use the attached curated clinic facts for public information and patient-facing FAQ.
- If the answer is not in the curated facts, do not guess. Offer staff follow-up instead.`;

const CURATED_FACTS_TEXT = `# Curated clinic facts

- clinic: ${EMIHA_CLINIC_PROFILE.clinicName}
- address: ${EMIHA_CLINIC_PROFILE.address}
- phone: ${EMIHA_CLINIC_PROFILE.phoneNumber}
- business hours: ${EMIHA_CLINIC_PROFILE.businessHours}
- closed days: ${EMIHA_CLINIC_PROFILE.closedDays}
- reservation policy: ${EMIHA_CLINIC_PROFILE.reservationPolicy}
- first visit note: ${EMIHA_CLINIC_PROFILE.firstVisitArrivalNote}
- emergency policy: ${EMIHA_CLINIC_PROFILE.emergencyPolicy}
- access: ${EMIHA_CLINIC_PROFILE.accessSummary}
- nearest station: ${EMIHA_CLINIC_PROFILE.nearestStation}
- parking: ${EMIHA_CLINIC_PROFILE.parking}
- official site: ${EMIHA_CLINIC_PROFILE.officialSiteUrl}
- source checked at: ${EMIHA_CLINIC_PROFILE.sourceCheckedAt}

# Patient FAQ

${EMIHA_FAQ_ENTRIES.map(
  (entry) =>
    `## ${entry.question}

- answer: ${entry.answer}
- tags: ${entry.tags.join(", ")}`
).join("\n\n")}
`;

export const DENTAL_DEMO_MANAGED_KB_DOCUMENTS: ManagedKnowledgeBaseDocument[] = [
  {
    key: "curated-facts",
    name: `${DENTAL_DEMO_MANAGED_KB_PREFIX}-curated-facts`,
    text: CURATED_FACTS_TEXT,
    usageMode: "prompt",
  },
];

export function buildManagedKnowledgeBaseDocuments() {
  return DENTAL_DEMO_MANAGED_KB_DOCUMENTS;
}

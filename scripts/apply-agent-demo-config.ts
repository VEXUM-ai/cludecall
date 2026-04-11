import { request as httpsRequest } from "node:https";

import {
  DENTAL_DEMO_DATA_COLLECTION,
  DENTAL_DEMO_EVALUATION_CRITERIA,
  DENTAL_DEMO_EXPRESSIVE_MODE,
  DENTAL_DEMO_LANGUAGE,
  DENTAL_DEMO_PROMPT,
  DENTAL_DEMO_SUGGESTED_AUDIO_TAGS,
  DENTAL_DEMO_TIMEZONE,
  DENTAL_DEMO_TTS_MODEL_ID,
  DENTAL_DEMO_VOICE_ID,
  DENTAL_DEMO_VOICE_NAME,
} from "../lib/agent-demo-config";
import {
  buildManagedKnowledgeBaseDocuments,
  DENTAL_DEMO_MANAGED_KB_PREFIX,
  MANAGED_KNOWLEDGE_BASE_ID_PREFIXES,
} from "../lib/agent-knowledge-base";
import {
  DENTAL_DEMO_FAST_CASCADE_TIMEOUT_SECONDS,
  DENTAL_DEMO_FAST_FIRST_MESSAGE,
  DENTAL_DEMO_FAST_MAX_TOKENS,
  DENTAL_DEMO_FAST_PRIMARY_LLM,
  DENTAL_DEMO_FAST_SOFT_TIMEOUT_MESSAGE,
  DENTAL_DEMO_FAST_SOFT_TIMEOUT_SECONDS,
  DENTAL_DEMO_FAST_TTS_SPEED,
  DENTAL_DEMO_FAST_TURN_EAGERNESS,
  DENTAL_DEMO_FAST_TURN_TIMEOUT_SECONDS,
} from "../lib/agent-speed-config";
import { getServerConfig } from "../lib/env";
import { loadDotenvFile } from "./load-dotenv";

type JsonObject = Record<string, unknown>;

const DENTAL_DEMO_MANAGED_KB_DOCUMENTS = buildManagedKnowledgeBaseDocuments();
const DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_NAME =
  "Dental Intake AI JA Pronunciation";
const DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_DESCRIPTION =
  "Managed by scripts/apply-agent-demo-config.ts";
const DENTAL_DEMO_MANAGED_PRONUNCIATION_RULES = [
  {
    string_to_replace:
      "\u3048\u307f\u306f\u7dcf\u5408\u6b6f\u79d1 \u5927\u962a\u6885\u7530\u9662",
    alias:
      "\u3048\u307f\u306f\u305d\u3046\u3054\u3046\u3057\u304b \u304a\u304a\u3055\u304b\u3046\u3081\u3060\u3044\u3093",
  },
  {
    string_to_replace: "\u3048\u307f\u306f\u7dcf\u5408\u6b6f\u79d1",
    alias: "\u3048\u307f\u306f\u305d\u3046\u3054\u3046\u3057\u304b",
  },
  {
    string_to_replace: "\u3048\u307f\u306f",
    alias: "\u3048\u307f\u306f",
  },
  {
    string_to_replace: "\u3048\u307f\u306f\u7dcf\u5408\u6b6f\u79d1 \u6885\u7530\u9662",
    alias: "\u3048\u307f\u306f\u305d\u3046\u3054\u3046\u3057\u304b \u3046\u3081\u3060\u3044\u3093",
  },
  {
    string_to_replace: "\u5927\u962a\u6885\u7530\u9662",
    alias: "\u304a\u304a\u3055\u304b\u3046\u3081\u3060\u3044\u3093",
  },
  {
    string_to_replace: "\u6885\u7530\u9662",
    alias: "\u3046\u3081\u3060\u3044\u3093",
  },
  {
    string_to_replace: "\u89aa\u77e5\u3089\u305a\u629c\u6b6f",
    alias: "\u304a\u3084\u3057\u3089\u305a\u3070\u3063\u3057",
  },
  {
    string_to_replace: "\u629c\u6b6f",
    alias: "\u3070\u3063\u3057",
  },
  {
    string_to_replace: "\u554f\u8a3a\u7968",
    alias: "\u3082\u3093\u3057\u3093\u3072\u3087\u3046",
  },
  {
    string_to_replace: "LINE",
    alias: "\u3089\u3044\u3093",
  },
  {
    string_to_replace: "\u627f\u308a\u307e\u3059",
    alias: "\u3046\u3051\u305f\u307e\u308f\u308a\u307e\u3059",
  },
  {
    string_to_replace: "\u65e5\u6642",
    alias: "\u306b\u3061\u3058",
  },
] as const;
type RequestJsonErrorDetail =
  | string
  | {
      type?: string;
      code?: string;
      message?: string;
      status?: string;
      request_id?: string;
    };

class RequestJsonError extends Error {
  detail: RequestJsonErrorDetail | null;

  constructor(message: string, detail: RequestJsonErrorDetail | null) {
    super(message);
    this.name = "RequestJsonError";
    this.detail = detail;
  }
}

function requestJson(
  url: URL,
  init: {
    method: "GET" | "PATCH" | "POST" | "DELETE";
    apiKey: string;
    body?: JsonObject;
  }
): Promise<JsonObject> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: init.method,
        headers: {
          "Content-Type": "application/json",
          "xi-api-key": init.apiKey,
        },
      },
      (response) => {
        let rawBody = "";
        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          rawBody += chunk;
        });

        response.on("end", () => {
          const payload = rawBody ? JSON.parse(rawBody) : {};
          if ((response.statusCode ?? 500) >= 400) {
            const detail =
              typeof payload?.detail === "string" || typeof payload?.detail === "object"
                ? (payload.detail as RequestJsonErrorDetail)
                : null;
            const message =
              typeof payload?.detail === "string"
                ? payload.detail
                : typeof payload?.detail?.message === "string"
                  ? payload.detail.message
                : `ElevenLabs request failed with ${response.statusCode ?? 500}`;
            reject(new RequestJsonError(message, detail));
            return;
          }

          resolve(payload as JsonObject);
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    if (init.body) {
      request.write(JSON.stringify(init.body));
    }

    request.end();
  });
}

function requestText(
  url: URL,
  init: {
    method: "GET";
    apiKey: string;
  }
): Promise<string> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: init.method,
        headers: {
          "xi-api-key": init.apiKey,
        },
      },
      (response) => {
        let rawBody = "";
        response.setEncoding("utf8");

        response.on("data", (chunk) => {
          rawBody += chunk;
        });

        response.on("end", () => {
          if ((response.statusCode ?? 500) >= 400) {
            reject(new Error(`ElevenLabs text request failed with ${response.statusCode ?? 500}`));
            return;
          }

          resolve(rawBody);
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    request.end();
  });
}

function buildDataCollectionConfig() {
  return Object.fromEntries(
    DENTAL_DEMO_DATA_COLLECTION.map((item) => [
      item.identifier,
      {
        type: item.type,
        description: item.description,
      },
    ])
  );
}

function buildEvaluationCriteriaConfig() {
  return DENTAL_DEMO_EVALUATION_CRITERIA.map((item) => ({
    id: item.id,
    conversation_goal_prompt: item.conversationGoalPrompt,
  }));
}

function readOptionalEnv(name: string): string | null {
  const value = process.env[name]?.trim();
  return value ? value : null;
}

function readOptionalBooleanEnv(name: string): boolean | null {
  const value = readOptionalEnv(name);
  if (value === null) {
    return null;
  }

  const normalized = value.toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) {
    return true;
  }

  if (["false", "0", "no", "off"].includes(normalized)) {
    return false;
  }

  throw new Error(`${name} must be a boolean-like value.`);
}

function readOptionalNumberEnv(name: string): number | null {
  const value = readOptionalEnv(name);
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error(`${name} must be a number.`);
  }

  return parsed;
}

function readOptionalStringArrayEnv(name: string): string[] | null {
  const value = readOptionalEnv(name);
  if (value === null) {
    return null;
  }

  return value
    .split(",")
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
}

function normalizeKnowledgeBaseContent(value: string) {
  return value.replace(/\r\n/g, "\n").trim();
}

type ManagedKnowledgeBaseEntry = {
  id: string;
  name: string;
  type: "text";
  usage_mode: "auto" | "prompt";
};

type ExistingKnowledgeBaseEntry = {
  id: string;
  name?: string;
  type?: string;
  usage_mode?: string;
};

type KnowledgeBaseDocumentRecord = {
  id: string;
  name?: string;
  type?: string;
};

type KnowledgeBaseRagIndexRecord = {
  id?: string;
  model?: string;
  status?: string;
  progress_percentage?: number;
};

type PronunciationRulePayload = {
  string_to_replace: string;
  type: "alias";
  alias: string;
};

type PronunciationDictionaryMetadata = {
  id: string;
  name: string;
  latest_version_id: string;
  latest_version_rules_num: number | null;
  description: string | null;
};

type PronunciationDictionaryLocator = {
  pronunciation_dictionary_id: string;
  version_id: string;
};

type ManagedPronunciationDictionary = {
  dictionaryId: string;
  dictionaryName: string;
  versionId: string;
  versionRulesNum: number | null;
  created: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function normalizeExistingKnowledgeBaseEntries(value: unknown): ExistingKnowledgeBaseEntry[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0) {
      return [];
    }

    return [
      {
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : undefined,
        type: typeof entry.type === "string" ? entry.type : undefined,
        usage_mode: typeof entry.usage_mode === "string" ? entry.usage_mode : undefined,
      },
    ];
  });
}

function normalizeExistingPronunciationDictionaryLocators(
  value: unknown
): PronunciationDictionaryLocator[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const pronunciationDictionaryId =
      typeof entry.pronunciation_dictionary_id === "string"
        ? entry.pronunciation_dictionary_id
        : null;
    const versionId = typeof entry.version_id === "string" ? entry.version_id : null;

    if (!pronunciationDictionaryId || !versionId) {
      return [];
    }

    return [
      {
        pronunciation_dictionary_id: pronunciationDictionaryId,
        version_id: versionId,
      },
    ];
  });
}

function mergeKnowledgeBaseEntries(
  currentEntries: ExistingKnowledgeBaseEntry[],
  managedEntries: ManagedKnowledgeBaseEntry[]
) {
  const retainedEntries = currentEntries.filter((entry) => {
    const name = entry.name ?? "";
    return !MANAGED_KNOWLEDGE_BASE_ID_PREFIXES.some((prefix) => name.startsWith(`${prefix}-`));
  });
  return [...retainedEntries, ...managedEntries];
}

function mergePronunciationDictionaryLocators(
  currentLocators: PronunciationDictionaryLocator[],
  managedLocator: PronunciationDictionaryLocator
) {
  const retainedLocators = currentLocators.filter(
    (locator) =>
      locator.pronunciation_dictionary_id !== managedLocator.pronunciation_dictionary_id
  );
  return [...retainedLocators, managedLocator];
}

function buildManagedPronunciationRulePayload(): PronunciationRulePayload[] {
  return DENTAL_DEMO_MANAGED_PRONUNCIATION_RULES.map((rule) => ({
    string_to_replace: rule.string_to_replace,
    type: "alias",
    alias: rule.alias,
  }));
}

async function listKnowledgeBaseDocuments(apiKey: string, search: string) {
  const url = new URL("https://api.elevenlabs.io/v1/convai/knowledge-base");
  url.searchParams.set("search", search);
  url.searchParams.set("types", "text");
  url.searchParams.set("page_size", "100");

  const payload = await requestJson(url, {
    method: "GET",
    apiKey,
  });

  const documents = Array.isArray(payload.documents) ? payload.documents : [];
  return documents.flatMap((entry): KnowledgeBaseDocumentRecord[] => {
    if (!isRecord(entry) || typeof entry.id !== "string" || entry.id.length === 0) {
      return [];
    }

    return [
      {
        id: entry.id,
        name: typeof entry.name === "string" ? entry.name : undefined,
        type: typeof entry.type === "string" ? entry.type : undefined,
      },
    ];
  });
}

async function getKnowledgeBaseDocumentContent(apiKey: string, documentId: string) {
  const url = new URL(`https://api.elevenlabs.io/v1/convai/knowledge-base/${documentId}/content`);
  return requestText(url, {
    method: "GET",
    apiKey,
  });
}

async function createKnowledgeBaseDocumentFromText(args: {
  apiKey: string;
  name: string;
  text: string;
}) {
  const url = new URL("https://api.elevenlabs.io/v1/convai/knowledge-base/text");
  const payload = await requestJson(url, {
    method: "POST",
    apiKey: args.apiKey,
    body: {
      name: args.name,
      text: args.text,
    },
  });

  const id =
    typeof payload.id === "string"
      ? payload.id
      : typeof payload.documentation_id === "string"
        ? payload.documentation_id
        : null;
  const name = typeof payload.name === "string" ? payload.name : args.name;
  if (!id) {
    throw new Error(`Failed to create knowledge base document: ${args.name}`);
  }

  return {
    id,
    name,
  };
}

async function deleteKnowledgeBaseDocument(apiKey: string, documentId: string) {
  const url = new URL(`https://api.elevenlabs.io/v1/convai/knowledge-base/${documentId}`);
  await requestJson(url, {
    method: "DELETE",
    apiKey,
  });
}

function isKnowledgeBaseStillInUseError(error: unknown) {
  if (!(error instanceof Error)) {
    return false;
  }

  return /Document is still in use/i.test(error.message);
}

async function getKnowledgeBaseDocumentRagIndexes(apiKey: string, documentId: string) {
  const url = new URL(`https://api.elevenlabs.io/v1/convai/knowledge-base/${documentId}/rag-index`);
  const payload = await requestJson(url, {
    method: "GET",
    apiKey,
  });

  const indexes = Array.isArray(payload.indexes) ? payload.indexes : [];
  return indexes.flatMap((entry): KnowledgeBaseRagIndexRecord[] => {
    if (!isRecord(entry)) {
      return [];
    }

    return [
      {
        id: typeof entry.id === "string" ? entry.id : undefined,
        model: typeof entry.model === "string" ? entry.model : undefined,
        status: typeof entry.status === "string" ? entry.status : undefined,
        progress_percentage:
          typeof entry.progress_percentage === "number" ? entry.progress_percentage : undefined,
      },
    ];
  });
}

async function computeKnowledgeBaseDocumentRagIndex(args: {
  apiKey: string;
  documentId: string;
  model: string;
}) {
  const url = new URL(`https://api.elevenlabs.io/v1/convai/knowledge-base/${args.documentId}/rag-index`);
  await requestJson(url, {
    method: "POST",
    apiKey: args.apiKey,
    body: {
      model: args.model,
    },
  });
}

async function ensureManagedKnowledgeBaseRagIndexes(apiKey: string, documents: ManagedKnowledgeBaseEntry[]) {
  const ragModel = "e5_mistral_7b_instruct";

  for (const document of documents) {
    const indexes = await getKnowledgeBaseDocumentRagIndexes(apiKey, document.id);
    const currentIndex = indexes.find((index) => index.model === ragModel);
    if (!currentIndex || !["created", "succeeded"].includes(currentIndex.status ?? "")) {
      await computeKnowledgeBaseDocumentRagIndex({
        apiKey,
        documentId: document.id,
        model: ragModel,
      });
    }
  }
}

async function ensureManagedKnowledgeBaseDocuments(apiKey: string): Promise<ManagedKnowledgeBaseEntry[]> {
  const resolvedDocuments: ManagedKnowledgeBaseEntry[] = [];
  const desiredNames = new Set(DENTAL_DEMO_MANAGED_KB_DOCUMENTS.map((entry) => entry.name));
  const existingManagedDocuments = await listKnowledgeBaseDocuments(apiKey, DENTAL_DEMO_MANAGED_KB_PREFIX);

  for (const existing of existingManagedDocuments) {
    const name = existing.name ?? "";
    if (
      MANAGED_KNOWLEDGE_BASE_ID_PREFIXES.some((prefix) => name.startsWith(`${prefix}-`)) &&
      !desiredNames.has(name)
    ) {
      try {
        await deleteKnowledgeBaseDocument(apiKey, existing.id);
      } catch (error) {
        if (!isKnowledgeBaseStillInUseError(error)) {
          throw error;
        }
        console.warn(
          `Knowledge base document ${name || existing.id} is still attached to an agent. Keeping it for this run.`
        );
      }
    }
  }

  for (const desired of DENTAL_DEMO_MANAGED_KB_DOCUMENTS) {
    const existingDocuments = (await listKnowledgeBaseDocuments(apiKey, desired.name)).filter(
      (entry) => entry.name === desired.name
    );

    let resolvedId: string | null = null;
    for (const existing of existingDocuments) {
      const content = await getKnowledgeBaseDocumentContent(apiKey, existing.id);
      if (normalizeKnowledgeBaseContent(content) === normalizeKnowledgeBaseContent(desired.text)) {
        resolvedId = existing.id;
        break;
      }
    }

    if (!resolvedId) {
      for (const existing of existingDocuments) {
        try {
          await deleteKnowledgeBaseDocument(apiKey, existing.id);
        } catch (error) {
          if (!isKnowledgeBaseStillInUseError(error)) {
            throw error;
          }
          console.warn(
            `Knowledge base document ${desired.name} is still attached to an agent. Creating a replacement document instead of deleting it first.`
          );
        }
      }

      const created = await createKnowledgeBaseDocumentFromText({
        apiKey,
        name: desired.name,
        text: desired.text,
      });
      resolvedId = created.id;
    }

    resolvedDocuments.push({
      id: resolvedId,
      name: desired.name,
      type: "text",
      usage_mode: desired.usageMode,
    });
  }

  await ensureManagedKnowledgeBaseRagIndexes(apiKey, resolvedDocuments);

  return resolvedDocuments;
}

async function listPronunciationDictionaries(apiKey: string): Promise<PronunciationDictionaryMetadata[]> {
  const dictionaries: PronunciationDictionaryMetadata[] = [];
  let nextCursor: string | null = null;

  do {
    const url = new URL("https://api.elevenlabs.io/v1/pronunciation-dictionaries");
    url.searchParams.set("page_size", "100");
    if (nextCursor) {
      url.searchParams.set("cursor", nextCursor);
    }

    const payload = await requestJson(url, {
      method: "GET",
      apiKey,
    });

    const pageItems = Array.isArray(payload.pronunciation_dictionaries)
      ? payload.pronunciation_dictionaries
      : [];

    dictionaries.push(
      ...pageItems.flatMap((entry): PronunciationDictionaryMetadata[] => {
        if (!isRecord(entry)) {
          return [];
        }

        const id = typeof entry.id === "string" ? entry.id : null;
        const name = typeof entry.name === "string" ? entry.name : null;
        const latestVersionId =
          typeof entry.latest_version_id === "string" ? entry.latest_version_id : null;

        if (!id || !name || !latestVersionId) {
          return [];
        }

        return [
          {
            id,
            name,
            latest_version_id: latestVersionId,
            latest_version_rules_num:
              typeof entry.latest_version_rules_num === "number"
                ? entry.latest_version_rules_num
                : null,
            description: typeof entry.description === "string" ? entry.description : null,
          },
        ];
      })
    );

    nextCursor =
      payload.has_more === true && typeof payload.next_cursor === "string"
        ? payload.next_cursor
        : null;
  } while (nextCursor);

  return dictionaries;
}

async function createManagedPronunciationDictionary(apiKey: string) {
  const url = new URL("https://api.elevenlabs.io/v1/pronunciation-dictionaries/add-from-rules");
  const payload = await requestJson(url, {
    method: "POST",
    apiKey,
    body: {
      name: DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_NAME,
      description: DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_DESCRIPTION,
      rules: buildManagedPronunciationRulePayload(),
    } satisfies JsonObject,
  });

  const dictionaryId = typeof payload.id === "string" ? payload.id : null;
  const versionId = typeof payload.version_id === "string" ? payload.version_id : null;
  const dictionaryName =
    typeof payload.name === "string"
      ? payload.name
      : DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_NAME;

  if (!dictionaryId || !versionId) {
    throw new Error("Failed to create managed pronunciation dictionary.");
  }

  return {
    dictionaryId,
    dictionaryName,
    versionId,
    versionRulesNum:
      typeof payload.version_rules_num === "number" ? payload.version_rules_num : null,
    created: true,
  } satisfies ManagedPronunciationDictionary;
}

async function setManagedPronunciationDictionaryRules(apiKey: string, dictionaryId: string) {
  const url = new URL(
    `https://api.elevenlabs.io/v1/pronunciation-dictionaries/${dictionaryId}/set-rules`
  );
  const payload = await requestJson(url, {
    method: "POST",
    apiKey,
    body: {
      rules: buildManagedPronunciationRulePayload(),
    } satisfies JsonObject,
  });

  const returnedDictionaryId = typeof payload.id === "string" ? payload.id : null;
  const versionId = typeof payload.version_id === "string" ? payload.version_id : null;

  if (!returnedDictionaryId || !versionId) {
    throw new Error("Failed to update managed pronunciation dictionary rules.");
  }

  return {
    dictionaryId: returnedDictionaryId,
    versionId,
    versionRulesNum:
      typeof payload.version_rules_num === "number" ? payload.version_rules_num : null,
  };
}

async function ensureManagedPronunciationDictionary(
  apiKey: string
): Promise<ManagedPronunciationDictionary> {
  const existingDictionaries = (await listPronunciationDictionaries(apiKey)).filter(
    (entry) => entry.name === DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_NAME
  );

  const preferredExistingDictionary =
    existingDictionaries.find(
      (entry) => entry.description === DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_DESCRIPTION
    ) ?? existingDictionaries[0];

  if (!preferredExistingDictionary) {
    return createManagedPronunciationDictionary(apiKey);
  }

  if (existingDictionaries.length > 1) {
    console.warn(
      `Multiple pronunciation dictionaries matched ${DENTAL_DEMO_MANAGED_PRONUNCIATION_DICTIONARY_NAME}; updating ${preferredExistingDictionary.id}.`
    );
  }

  const updatedDictionary = await setManagedPronunciationDictionaryRules(
    apiKey,
    preferredExistingDictionary.id
  );

  return {
    dictionaryId: updatedDictionary.dictionaryId,
    dictionaryName: preferredExistingDictionary.name,
    versionId: updatedDictionary.versionId,
    versionRulesNum: updatedDictionary.versionRulesNum,
    created: false,
  };
}

function isMonitoringEnterpriseOnlyError(error: unknown) {
  if (!(error instanceof RequestJsonError)) {
    return false;
  }

  return (
    typeof error.detail === "object" &&
    error.detail !== null &&
    error.detail.code === "feature_not_available" &&
    error.detail.status === "monitoring_enterprise_only"
  );
}

function normalizeExistingPromptTools(value: unknown): JsonObject[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    return [entry as JsonObject];
  });
}

function readTransferType() {
  const value = (
    readOptionalEnv("URGENT_TRANSFER_MODE") ??
    readOptionalEnv("EMIHA_URGENT_TRANSFER_TYPE") ??
    "conference"
  ).toLowerCase();
  if (value !== "conference" && value !== "blind" && value !== "sip_refer") {
    throw new Error(
      "URGENT_TRANSFER_MODE must be one of conference, blind, or sip_refer."
    );
  }

  return value as "conference" | "blind" | "sip_refer";
}

function buildUrgentTransferToolConfig() {
  const transferNumber =
    readOptionalEnv("URGENT_TRANSFER_PHONE_NUMBER") ??
    readOptionalEnv("EMIHA_URGENT_TRANSFER_PHONE_NUMBER");
  if (!transferNumber) {
    return null;
  }

  const transferType = readTransferType();
  const postDialDigits =
    readOptionalEnv("URGENT_TRANSFER_POST_DIAL_DIGITS") ??
    readOptionalEnv("EMIHA_URGENT_TRANSFER_POST_DIAL_DIGITS");

  return {
    type: "system",
    name: "transfer_to_number",
    description:
      "Transfer urgent callers or callers asking for a human receptionist to the configured clinic handoff number. Use it immediately on the first eligible turn, without any free-form acknowledgement first. The spoken transfer sentence should start directly with a transfer phrase such as '担当者におつなぎします。' and should not start with filler such as '承知いたしました' or 'ただ'.",
    response_timeout_secs: 20,
    disable_interruptions: false,
    force_pre_tool_speech: false,
    assignments: [],
    tool_call_sound: null,
    tool_call_sound_behavior: "auto",
    tool_error_handling_mode: "auto",
    params: {
      system_tool_type: "transfer_to_number",
      enable_client_message: true,
      transfers: [
        {
          transfer_destination: {
            type: "phone",
            phone_number: transferNumber,
          },
          condition:
            "The caller explicitly asks to speak with staff, requests a human, or reports a same-day urgent dental issue such as strong pain, swelling, bleeding, trauma, or fever.",
          transfer_type: transferType,
          ...(postDialDigits ? { post_dial_digits: postDialDigits } : {}),
        },
      ],
    },
  } satisfies JsonObject;
}

function buildPatchBody(args: {
  conversationConfig: JsonObject;
  currentConversationSettings: JsonObject;
  currentTurnConfig: JsonObject;
  currentTtsConfig: JsonObject;
  currentAgentConfig: JsonObject;
  currentPromptConfig: JsonObject;
  currentPlatformSettings: JsonObject;
  currentGuardrails: JsonObject;
  currentFocusGuardrail: JsonObject;
  managedKnowledgeBaseEntries: ManagedKnowledgeBaseEntry[];
  managedPronunciationDictionary: ManagedPronunciationDictionary;
  resolvedTtsModelId: string;
  resolvedVoiceId: string;
  resolvedExpressiveMode: boolean;
  resolvedSuggestedAudioTags: string[];
  resolvedTurnTimeoutSeconds: number;
  resolvedTurnEagerness: string;
  resolvedSoftTimeoutSeconds: number;
  resolvedSoftTimeoutMessage: string;
  resolvedTtsSpeed: number;
  resolvedMaxTokens: number;
  resolvedLlm: string;
  resolvedCascadeTimeoutSeconds: number;
  resolvedDisableFirstMessageInterruptions: boolean;
  urgentTransferTool: JsonObject | null;
  includeMonitoring: boolean;
}) {
  const conversationSettings: JsonObject = {
    ...args.currentConversationSettings,
  };
  const currentRagConfig = ((args.currentPromptConfig.rag ?? {}) as JsonObject) satisfies JsonObject;
  const mergedKnowledgeBaseEntries = mergeKnowledgeBaseEntries(
    normalizeExistingKnowledgeBaseEntries(args.currentPromptConfig.knowledge_base),
    args.managedKnowledgeBaseEntries
  );
  const mergedPronunciationDictionaryLocators = mergePronunciationDictionaryLocators(
    normalizeExistingPronunciationDictionaryLocators(
      args.currentTtsConfig.pronunciation_dictionary_locators
    ),
    {
      pronunciation_dictionary_id: args.managedPronunciationDictionary.dictionaryId,
      version_id: args.managedPronunciationDictionary.versionId,
    }
  );
  const {
    tools: _legacyTools,
    built_in_tools: currentBuiltInToolsRaw,
    tool_ids: currentToolIdsRaw,
    ...currentPromptConfigWithoutTooling
  } = args.currentPromptConfig;
  const mergedBuiltInTools = {
    ...(isRecord(currentBuiltInToolsRaw) ? currentBuiltInToolsRaw : {}),
    transfer_to_number: args.urgentTransferTool,
  } satisfies JsonObject;
  const currentToolIds = Array.isArray(currentToolIdsRaw)
    ? currentToolIdsRaw.filter(
        (item): item is string => typeof item === "string" && item.length > 0
      )
    : [];
  const ragEnabled = true;

  if (args.includeMonitoring) {
    conversationSettings.monitoring_enabled = true;
    conversationSettings.monitoring_events = Array.isArray(
      args.currentConversationSettings.monitoring_events
    )
      ? args.currentConversationSettings.monitoring_events
      : ["user_transcript", "agent_response", "agent_response_correction"];
  }

  const softTimeoutConfig: JsonObject = {
    ...((args.currentTurnConfig.soft_timeout_config ?? {}) as JsonObject),
    timeout_seconds: args.resolvedSoftTimeoutSeconds,
    use_llm_generated_message: false,
  };

  if (
    args.resolvedSoftTimeoutSeconds >= 0 &&
    typeof args.resolvedSoftTimeoutMessage === "string" &&
    args.resolvedSoftTimeoutMessage.length > 0
  ) {
    softTimeoutConfig.message = args.resolvedSoftTimeoutMessage;
  } else {
    delete softTimeoutConfig.message;
  }

  return {
    conversation_config: {
      ...args.conversationConfig,
      conversation: conversationSettings,
      turn: {
        ...args.currentTurnConfig,
        turn_timeout: args.resolvedTurnTimeoutSeconds,
        turn_eagerness: args.resolvedTurnEagerness,
        soft_timeout_config: softTimeoutConfig,
      },
      tts: {
        ...args.currentTtsConfig,
        model_id: args.resolvedTtsModelId,
        voice_id: args.resolvedVoiceId,
        expressive_mode: args.resolvedExpressiveMode,
        suggested_audio_tags: args.resolvedSuggestedAudioTags,
        speed: args.resolvedTtsSpeed,
        pronunciation_dictionary_locators: mergedPronunciationDictionaryLocators,
      },
      agent: {
        ...args.currentAgentConfig,
        first_message: DENTAL_DEMO_FAST_FIRST_MESSAGE,
        language: DENTAL_DEMO_LANGUAGE,
        disable_first_message_interruptions: args.resolvedDisableFirstMessageInterruptions,
        prompt: {
          ...currentPromptConfigWithoutTooling,
          prompt: DENTAL_DEMO_PROMPT,
          knowledge_base: mergedKnowledgeBaseEntries,
          tool_ids: currentToolIds,
          built_in_tools: mergedBuiltInTools,
          llm: args.resolvedLlm,
          temperature: 0.1,
          max_tokens: args.resolvedMaxTokens,
          cascade_timeout_seconds: args.resolvedCascadeTimeoutSeconds,
          timezone: DENTAL_DEMO_TIMEZONE,
          rag: {
            ...currentRagConfig,
            enabled: ragEnabled,
            embedding_model:
              typeof currentRagConfig.embedding_model === "string" &&
              currentRagConfig.embedding_model.length > 0
                ? currentRagConfig.embedding_model
                : "e5_mistral_7b_instruct",
            max_documents_length:
              typeof currentRagConfig.max_documents_length === "number"
                ? Math.min(currentRagConfig.max_documents_length, 3000)
                : 3000,
            max_retrieved_rag_chunks_count:
              typeof currentRagConfig.max_retrieved_rag_chunks_count === "number"
                ? Math.min(currentRagConfig.max_retrieved_rag_chunks_count, 2)
                : 2,
            max_vector_distance:
              typeof currentRagConfig.max_vector_distance === "number"
                ? Math.min(currentRagConfig.max_vector_distance, 0.22)
                : 0.22,
          },
        },
      },
    },
    platform_settings: {
      ...args.currentPlatformSettings,
      summary_language: DENTAL_DEMO_LANGUAGE,
      data_collection: buildDataCollectionConfig(),
      evaluation: {
        criteria: buildEvaluationCriteriaConfig(),
      },
      guardrails: {
        ...args.currentGuardrails,
        focus: {
          ...args.currentFocusGuardrail,
          is_enabled: true,
        },
      },
    },
  } satisfies JsonObject;
}

async function main() {
  loadDotenvFile();
  const { apiKey, agentId } = getServerConfig();
  const agentUrl = new URL(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`);

  const currentAgent = await requestJson(agentUrl, {
    method: "GET",
    apiKey,
  });

  const conversationConfig = ((currentAgent.conversation_config ??
    {}) as JsonObject) satisfies JsonObject;
  const currentAgentConfig = ((conversationConfig.agent ?? {}) as JsonObject) satisfies JsonObject;
  const currentPromptConfig = ((currentAgentConfig.prompt ?? {}) as JsonObject) satisfies JsonObject;
  const currentConversationSettings =
    ((conversationConfig.conversation ?? {}) as JsonObject) satisfies JsonObject;
  const currentTtsConfig = ((conversationConfig.tts ?? {}) as JsonObject) satisfies JsonObject;
  const currentTurnConfig = ((conversationConfig.turn ?? {}) as JsonObject) satisfies JsonObject;
  const currentPlatformSettings = ((currentAgent.platform_settings ?? {}) as JsonObject) satisfies JsonObject;
  const currentGuardrails = ((currentPlatformSettings.guardrails ?? {}) as JsonObject) satisfies JsonObject;
  const currentFocusGuardrail = ((currentGuardrails.focus ?? {}) as JsonObject) satisfies JsonObject;
  const managedKnowledgeBaseEntries = await ensureManagedKnowledgeBaseDocuments(apiKey);
  const managedPronunciationDictionary = await ensureManagedPronunciationDictionary(apiKey);
  const resolvedTtsModelId =
    readOptionalEnv("ELEVENLABS_TTS_MODEL_ID") ??
    (typeof currentTtsConfig.model_id === "string" && currentTtsConfig.model_id.length > 0
      ? currentTtsConfig.model_id
      : DENTAL_DEMO_TTS_MODEL_ID);
  const resolvedVoiceId =
    readOptionalEnv("ELEVENLABS_VOICE_ID") ??
    (typeof currentTtsConfig.voice_id === "string" && currentTtsConfig.voice_id.length > 0
      ? currentTtsConfig.voice_id
      : DENTAL_DEMO_VOICE_ID);
  const resolvedExpressiveMode =
    readOptionalBooleanEnv("ELEVENLABS_EXPRESSIVE_MODE") ??
    (resolvedTtsModelId.includes("v3")
      ? DENTAL_DEMO_EXPRESSIVE_MODE
      : typeof currentTtsConfig.expressive_mode === "boolean"
        ? currentTtsConfig.expressive_mode
        : false);
  const resolvedSuggestedAudioTags =
    readOptionalStringArrayEnv("ELEVENLABS_SUGGESTED_AUDIO_TAGS") ??
    (Array.isArray(currentTtsConfig.suggested_audio_tags)
      ? currentTtsConfig.suggested_audio_tags.filter(
          (item): item is string => typeof item === "string" && item.length > 0
        )
      : DENTAL_DEMO_SUGGESTED_AUDIO_TAGS);
  const resolvedTurnTimeoutSeconds =
    readOptionalNumberEnv("ELEVENLABS_TURN_TIMEOUT_SECONDS") ??
    DENTAL_DEMO_FAST_TURN_TIMEOUT_SECONDS;
  const resolvedTurnEagerness =
    readOptionalEnv("ELEVENLABS_TURN_EAGERNESS") ??
    DENTAL_DEMO_FAST_TURN_EAGERNESS;
  const resolvedSoftTimeoutSeconds =
    readOptionalNumberEnv("ELEVENLABS_SOFT_TIMEOUT_SECONDS") ??
    DENTAL_DEMO_FAST_SOFT_TIMEOUT_SECONDS;
  const resolvedSoftTimeoutMessage =
    readOptionalEnv("ELEVENLABS_SOFT_TIMEOUT_MESSAGE") ??
    DENTAL_DEMO_FAST_SOFT_TIMEOUT_MESSAGE;
  const resolvedTtsSpeed =
    readOptionalNumberEnv("ELEVENLABS_TTS_SPEED") ??
    DENTAL_DEMO_FAST_TTS_SPEED;
  const resolvedMaxTokens =
    readOptionalNumberEnv("ELEVENLABS_MAX_TOKENS") ??
    DENTAL_DEMO_FAST_MAX_TOKENS;
  const resolvedLlm = readOptionalEnv("ELEVENLABS_LLM") ?? DENTAL_DEMO_FAST_PRIMARY_LLM;
  const resolvedCascadeTimeoutSeconds =
    readOptionalNumberEnv("ELEVENLABS_CASCADE_TIMEOUT_SECONDS") ??
    DENTAL_DEMO_FAST_CASCADE_TIMEOUT_SECONDS;
  const resolvedDisableFirstMessageInterruptions =
    readOptionalBooleanEnv("ELEVENLABS_DISABLE_FIRST_MESSAGE_INTERRUPTIONS") ??
    (typeof currentAgentConfig.disable_first_message_interruptions === "boolean"
      ? currentAgentConfig.disable_first_message_interruptions
      : false);
  const urgentTransferTool = buildUrgentTransferToolConfig();

  const branchId =
    typeof currentAgent.branch_id === "string" && currentAgent.branch_id.length > 0
      ? currentAgent.branch_id
      : null;

  const patchUrl = new URL(agentUrl);
  if (branchId) {
    patchUrl.searchParams.set("branch_id", branchId);
  }

  let monitoringApplied = true;
  let updatedAgent: JsonObject;

  try {
    updatedAgent = await requestJson(patchUrl, {
      method: "PATCH",
      apiKey,
      body: buildPatchBody({
        conversationConfig,
        currentConversationSettings,
        currentTurnConfig,
        currentTtsConfig,
        currentAgentConfig,
        currentPromptConfig,
        currentPlatformSettings,
        currentGuardrails,
        currentFocusGuardrail,
        resolvedTtsModelId,
        resolvedVoiceId,
        resolvedExpressiveMode,
        resolvedSuggestedAudioTags,
        resolvedTurnTimeoutSeconds,
        resolvedTurnEagerness,
        resolvedSoftTimeoutSeconds,
        resolvedSoftTimeoutMessage,
        resolvedTtsSpeed,
        resolvedMaxTokens,
        resolvedLlm,
        resolvedCascadeTimeoutSeconds,
        resolvedDisableFirstMessageInterruptions,
        urgentTransferTool,
        includeMonitoring: true,
        managedKnowledgeBaseEntries,
        managedPronunciationDictionary,
      }),
    });
  } catch (error) {
    if (!isMonitoringEnterpriseOnlyError(error)) {
      throw error;
    }

    monitoringApplied = false;
    console.warn(
      "Real-time monitoring is not available on this ElevenLabs plan. Retrying without monitoring."
    );
    updatedAgent = await requestJson(patchUrl, {
      method: "PATCH",
      apiKey,
      body: buildPatchBody({
        conversationConfig,
        currentConversationSettings,
        currentTurnConfig,
        currentTtsConfig,
        currentAgentConfig,
        currentPromptConfig,
        currentPlatformSettings,
        currentGuardrails,
        currentFocusGuardrail,
        resolvedTtsModelId,
        resolvedVoiceId,
        resolvedExpressiveMode,
        resolvedSuggestedAudioTags,
        resolvedTurnTimeoutSeconds,
        resolvedTurnEagerness,
        resolvedSoftTimeoutSeconds,
        resolvedSoftTimeoutMessage,
        resolvedTtsSpeed,
        resolvedMaxTokens,
        resolvedLlm,
        resolvedCascadeTimeoutSeconds,
        resolvedDisableFirstMessageInterruptions,
        urgentTransferTool,
        includeMonitoring: false,
        managedKnowledgeBaseEntries,
        managedPronunciationDictionary,
      }),
    });
  }

  const updatedConversationConfig = (updatedAgent.conversation_config ?? {}) as JsonObject;
  const updatedAgentConfig = (updatedConversationConfig.agent ?? {}) as JsonObject;
  const updatedPromptConfig = (updatedAgentConfig.prompt ?? {}) as JsonObject;
  const updatedConversationSettings =
    (updatedConversationConfig.conversation ?? {}) as JsonObject;
  const updatedTtsConfig = (updatedConversationConfig.tts ?? {}) as JsonObject;
  const updatedPlatformSettings = (updatedAgent.platform_settings ?? {}) as JsonObject;
  const updatedDataCollection = (updatedPlatformSettings.data_collection ?? {}) as JsonObject;
  const updatedEvaluation = ((updatedPlatformSettings.evaluation ?? {}) as JsonObject) satisfies JsonObject;
  const updatedCriteria = Array.isArray(updatedEvaluation.criteria) ? updatedEvaluation.criteria : [];

  console.log("Applied dental demo config to agent.");
  console.log(`agentId: ${updatedAgent.agent_id}`);
  console.log(`language: ${String(updatedAgentConfig.language ?? "")}`);
  console.log(`llm: ${String(updatedPromptConfig.llm ?? "")}`);
  console.log(`ttsModel: ${String(updatedTtsConfig.model_id ?? "")}`);
  console.log(`voiceId: ${String(updatedTtsConfig.voice_id ?? "")}`);
  console.log(`expressiveMode: ${String(updatedTtsConfig.expressive_mode ?? "")}`);
  console.log(`ttsSpeed: ${String(updatedTtsConfig.speed ?? "")}`);
  console.log(
      `suggestedAudioTags: ${
      Array.isArray(updatedTtsConfig.suggested_audio_tags)
        ? updatedTtsConfig.suggested_audio_tags.join(",")
        : ""
    }`
  );
  console.log(`turnTimeout: ${String(((updatedConversationConfig.turn ?? {}) as JsonObject).turn_timeout ?? "")}`);
  console.log(`turnEagerness: ${String(((updatedConversationConfig.turn ?? {}) as JsonObject).turn_eagerness ?? "")}`);
  console.log(`monitoringEnabled: ${String(updatedConversationSettings.monitoring_enabled ?? "")}`);
  console.log(`monitoringApplied: ${String(monitoringApplied)}`);
  console.log(
    `monitoringEvents: ${
      Array.isArray(updatedConversationSettings.monitoring_events)
        ? updatedConversationSettings.monitoring_events.join(",")
        : ""
    }`
  );
  console.log(`defaultVoiceName: ${DENTAL_DEMO_VOICE_NAME}`);
  console.log(`managedKnowledgeBaseDocuments: ${managedKnowledgeBaseEntries.length}`);
  console.log(
    `knowledgeBaseDocumentNames: ${managedKnowledgeBaseEntries.map((item) => item.name).join(",")}`
  );
  console.log(`pronunciationDictionaryName: ${managedPronunciationDictionary.dictionaryName}`);
  console.log(`pronunciationDictionaryId: ${managedPronunciationDictionary.dictionaryId}`);
  console.log(`pronunciationDictionaryVersionId: ${managedPronunciationDictionary.versionId}`);
  console.log(
    `pronunciationDictionaryRules: ${String(managedPronunciationDictionary.versionRulesNum ?? DENTAL_DEMO_MANAGED_PRONUNCIATION_RULES.length)}`
  );
  console.log(`pronunciationDictionaryCreated: ${String(managedPronunciationDictionary.created)}`);
  console.log(`urgentTransferToolEnabled: ${String(Boolean(urgentTransferTool))}`);
  console.log(
    `urgentTransferPhoneNumber: ${String(
      readOptionalEnv("URGENT_TRANSFER_PHONE_NUMBER") ??
        readOptionalEnv("EMIHA_URGENT_TRANSFER_PHONE_NUMBER") ??
        ""
    )}`
  );
  console.log(
    `urgentTransferType: ${String(
      readOptionalEnv("URGENT_TRANSFER_MODE") ??
        readOptionalEnv("EMIHA_URGENT_TRANSFER_TYPE") ??
        "conference"
    )}`
  );
  console.log(`dataCollectionItems: ${Object.keys(updatedDataCollection).length}`);
  console.log(`evaluationCriteria: ${updatedCriteria.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

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
} from "../lib/agent-knowledge-base";
import {
  DENTAL_DEMO_FAST_CASCADE_TIMEOUT_SECONDS,
  DENTAL_DEMO_FAST_FIRST_MESSAGE,
  DENTAL_DEMO_FAST_MAX_TOKENS,
  DENTAL_DEMO_FAST_PROMPT,
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
const DENTAL_DEMO_MANAGED_KB_PREFIX = "emiha-";

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

function mergeKnowledgeBaseEntries(
  currentEntries: ExistingKnowledgeBaseEntry[],
  managedEntries: ManagedKnowledgeBaseEntry[]
) {
  const managedNames = new Set(DENTAL_DEMO_MANAGED_KB_DOCUMENTS.map((entry) => entry.name));
  const retainedEntries = currentEntries.filter((entry) => !managedNames.has(entry.name ?? ""));
  return [...retainedEntries, ...managedEntries];
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

async function ensureManagedKnowledgeBaseDocuments(apiKey: string): Promise<ManagedKnowledgeBaseEntry[]> {
  const resolvedDocuments: ManagedKnowledgeBaseEntry[] = [];

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
        await deleteKnowledgeBaseDocument(apiKey, existing.id);
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

  return resolvedDocuments;
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
  resolvedCascadeTimeoutSeconds: number;
  resolvedDisableFirstMessageInterruptions: boolean;
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
  const ragEnabled = mergedKnowledgeBaseEntries.some((item) => item.usage_mode === "auto");

  if (args.includeMonitoring) {
    conversationSettings.monitoring_enabled = true;
    conversationSettings.monitoring_events = Array.isArray(
      args.currentConversationSettings.monitoring_events
    )
      ? args.currentConversationSettings.monitoring_events
      : ["user_transcript", "agent_response", "agent_response_correction"];
  }

  return {
    conversation_config: {
      ...args.conversationConfig,
      conversation: conversationSettings,
      turn: {
        ...args.currentTurnConfig,
        turn_timeout: args.resolvedTurnTimeoutSeconds,
        turn_eagerness: args.resolvedTurnEagerness,
        soft_timeout_config: {
          ...((args.currentTurnConfig.soft_timeout_config ?? {}) as JsonObject),
          timeout_seconds: args.resolvedSoftTimeoutSeconds,
          message: args.resolvedSoftTimeoutMessage,
          use_llm_generated_message: false,
        },
      },
      tts: {
        ...args.currentTtsConfig,
        model_id: args.resolvedTtsModelId,
        voice_id: args.resolvedVoiceId,
        expressive_mode: args.resolvedExpressiveMode,
        suggested_audio_tags: args.resolvedSuggestedAudioTags,
        speed: args.resolvedTtsSpeed,
      },
      agent: {
        ...args.currentAgentConfig,
        first_message: DENTAL_DEMO_FAST_FIRST_MESSAGE,
        language: DENTAL_DEMO_LANGUAGE,
        disable_first_message_interruptions: args.resolvedDisableFirstMessageInterruptions,
        prompt: {
          ...args.currentPromptConfig,
          prompt: `${DENTAL_DEMO_PROMPT}\n\n${DENTAL_DEMO_FAST_PROMPT}`,
          knowledge_base: mergedKnowledgeBaseEntries,
          llm: "gemini-3-flash-preview",
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
                ? currentRagConfig.max_documents_length
                : 10000,
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
  const resolvedCascadeTimeoutSeconds =
    readOptionalNumberEnv("ELEVENLABS_CASCADE_TIMEOUT_SECONDS") ??
    DENTAL_DEMO_FAST_CASCADE_TIMEOUT_SECONDS;
  const resolvedDisableFirstMessageInterruptions =
    readOptionalBooleanEnv("ELEVENLABS_DISABLE_FIRST_MESSAGE_INTERRUPTIONS") ??
    (typeof currentAgentConfig.disable_first_message_interruptions === "boolean"
      ? currentAgentConfig.disable_first_message_interruptions
      : false);

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
        resolvedCascadeTimeoutSeconds,
        resolvedDisableFirstMessageInterruptions,
        includeMonitoring: true,
        managedKnowledgeBaseEntries,
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
        resolvedCascadeTimeoutSeconds,
        resolvedDisableFirstMessageInterruptions,
        includeMonitoring: false,
        managedKnowledgeBaseEntries,
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
  console.log(`dataCollectionItems: ${Object.keys(updatedDataCollection).length}`);
  console.log(`evaluationCriteria: ${updatedCriteria.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

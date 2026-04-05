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

function requestJson(
  url: URL,
  init: {
    method: "GET" | "PATCH";
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
            const message =
              typeof payload?.detail === "string"
                ? payload.detail
                : `ElevenLabs request failed with ${response.statusCode ?? 500}`;
            reject(new Error(message));
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
  const currentTtsConfig = ((conversationConfig.tts ?? {}) as JsonObject) satisfies JsonObject;
  const currentTurnConfig = ((conversationConfig.turn ?? {}) as JsonObject) satisfies JsonObject;
  const currentPlatformSettings = ((currentAgent.platform_settings ?? {}) as JsonObject) satisfies JsonObject;
  const currentGuardrails = ((currentPlatformSettings.guardrails ?? {}) as JsonObject) satisfies JsonObject;
  const currentFocusGuardrail = ((currentGuardrails.focus ?? {}) as JsonObject) satisfies JsonObject;
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

  const patchBody: JsonObject = {
    conversation_config: {
      ...conversationConfig,
      turn: {
        ...currentTurnConfig,
        turn_timeout: resolvedTurnTimeoutSeconds,
        turn_eagerness: resolvedTurnEagerness,
        soft_timeout_config: {
          ...((currentTurnConfig.soft_timeout_config ?? {}) as JsonObject),
          timeout_seconds: resolvedSoftTimeoutSeconds,
          message: resolvedSoftTimeoutMessage,
          use_llm_generated_message: false,
        },
      },
      tts: {
        ...currentTtsConfig,
        model_id: resolvedTtsModelId,
        voice_id: resolvedVoiceId,
        expressive_mode: resolvedExpressiveMode,
        suggested_audio_tags: resolvedSuggestedAudioTags,
        speed: resolvedTtsSpeed,
      },
      agent: {
        ...currentAgentConfig,
        first_message: DENTAL_DEMO_FAST_FIRST_MESSAGE,
        language: DENTAL_DEMO_LANGUAGE,
        disable_first_message_interruptions: resolvedDisableFirstMessageInterruptions,
        prompt: {
          ...currentPromptConfig,
          prompt: `${DENTAL_DEMO_PROMPT}\n\n${DENTAL_DEMO_FAST_PROMPT}`,
          llm: "gemini-3-flash-preview",
          temperature: 0.1,
          max_tokens: resolvedMaxTokens,
          cascade_timeout_seconds: resolvedCascadeTimeoutSeconds,
          timezone: DENTAL_DEMO_TIMEZONE,
        },
      },
    },
    platform_settings: {
      ...currentPlatformSettings,
      summary_language: DENTAL_DEMO_LANGUAGE,
      data_collection: buildDataCollectionConfig(),
      evaluation: {
        criteria: buildEvaluationCriteriaConfig(),
      },
      guardrails: {
        ...currentGuardrails,
        focus: {
          ...currentFocusGuardrail,
          is_enabled: true,
        },
      },
    },
  };

  const branchId =
    typeof currentAgent.branch_id === "string" && currentAgent.branch_id.length > 0
      ? currentAgent.branch_id
      : null;

  const patchUrl = new URL(agentUrl);
  if (branchId) {
    patchUrl.searchParams.set("branch_id", branchId);
  }

  const updatedAgent = await requestJson(patchUrl, {
    method: "PATCH",
    apiKey,
    body: patchBody,
  });

  const updatedConversationConfig = (updatedAgent.conversation_config ?? {}) as JsonObject;
  const updatedAgentConfig = (updatedConversationConfig.agent ?? {}) as JsonObject;
  const updatedPromptConfig = (updatedAgentConfig.prompt ?? {}) as JsonObject;
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
  console.log(`defaultVoiceName: ${DENTAL_DEMO_VOICE_NAME}`);
  console.log(`dataCollectionItems: ${Object.keys(updatedDataCollection).length}`);
  console.log(`evaluationCriteria: ${updatedCriteria.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

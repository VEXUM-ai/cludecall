import { request as httpsRequest } from "node:https";

import {
  DENTAL_DEMO_DATA_COLLECTION,
  DENTAL_DEMO_EVALUATION_CRITERIA,
  DENTAL_DEMO_FIRST_MESSAGE,
  DENTAL_DEMO_LANGUAGE,
  DENTAL_DEMO_PROMPT,
  DENTAL_DEMO_TIMEZONE,
  DENTAL_DEMO_TTS_MODEL_ID,
} from "../lib/agent-demo-config";
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
  const currentPlatformSettings = ((currentAgent.platform_settings ?? {}) as JsonObject) satisfies JsonObject;
  const currentGuardrails = ((currentPlatformSettings.guardrails ?? {}) as JsonObject) satisfies JsonObject;
  const currentFocusGuardrail = ((currentGuardrails.focus ?? {}) as JsonObject) satisfies JsonObject;

  const patchBody: JsonObject = {
    conversation_config: {
      ...conversationConfig,
      tts: {
        ...currentTtsConfig,
        model_id: DENTAL_DEMO_TTS_MODEL_ID,
      },
      agent: {
        ...currentAgentConfig,
        first_message: DENTAL_DEMO_FIRST_MESSAGE,
        language: DENTAL_DEMO_LANGUAGE,
        prompt: {
          ...currentPromptConfig,
          prompt: DENTAL_DEMO_PROMPT,
          llm: "gemini-3-flash-preview",
          temperature: 0.1,
          max_tokens: 220,
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
  console.log(`dataCollectionItems: ${Object.keys(updatedDataCollection).length}`);
  console.log(`evaluationCriteria: ${updatedCriteria.length}`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

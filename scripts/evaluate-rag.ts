import { mkdir, writeFile } from "node:fs/promises";
import { request as httpsRequest } from "node:https";
import path from "node:path";

import {
  type RagEvalCase,
  RAG_EVAL_CASES,
  RAG_EVAL_CRITICAL_THRESHOLD,
  type RagEvalPattern,
  RAG_EVAL_PASS_THRESHOLD,
} from "../lib/rag-eval-cases";
import { getServerConfig } from "../lib/env";
import { loadDotenvFile } from "./load-dotenv";

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

type AgentKnowledgeBaseEntry = {
  id: string;
  name: string;
  usage_mode?: string;
};

type SimulatedConversationTurn = {
  role?: string;
  message?: string | null;
  tool_calls?: Array<{
    tool_name?: string;
  }>;
  rag_retrieval_info?: {
    chunks?: Array<{
      document_id?: string;
      chunk_id?: string;
      vector_distance?: number;
    }>;
    retrieval_query?: string;
    rag_latency_secs?: number;
  } | null;
};

type SimulationResponse = {
  simulated_conversation?: SimulatedConversationTurn[];
  analysis?: JsonValue;
};

type CaseScore = {
  caseId: string;
  description: string;
  passed: boolean;
  critical: boolean;
  matchedRequired: string[];
  missingRequired: string[];
  matchedForbidden: string[];
  fragmentMessages: string[];
  answerText: string;
  retrievedDocumentNames: string[];
  retrievedUnexpectedDocumentNames: string[];
  retrievalQueries: string[];
  retrievalObserved: boolean;
  retrievalPrecision: number | null;
  retrievalExpectedCoverage: number | null;
};

type EvalSummary = {
  timestamp: string;
  agentId: string;
  totalCases: number;
  passedCases: number;
  passRate: number;
  criticalCases: number;
  criticalPassedCases: number;
  criticalPassRate: number;
  retrievalObservedCases: number;
  averageRetrievalPrecision: number | null;
  averageRetrievalExpectedCoverage: number | null;
  threshold: number;
  criticalThreshold: number;
  passed: boolean;
  cases: CaseScore[];
};

const DEFAULT_NEW_TURNS_LIMIT = 2;
const ARTIFACT_ROOT = path.join(process.cwd(), "artifacts", "debug", "rag-evals");

function requestJson(url: URL, init: { apiKey: string; method: "GET" | "POST"; body?: JsonValue }) {
  return new Promise<any>((resolve, reject) => {
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
          const statusCode = response.statusCode ?? 500;
          const payload = rawBody ? JSON.parse(rawBody) : {};
          if (statusCode >= 400) {
            reject(
              new Error(
                `ElevenLabs request failed with ${statusCode}: ${
                  typeof payload?.detail === "string"
                    ? payload.detail
                    : JSON.stringify(payload)
                }`
              )
            );
            return;
          }

          resolve(payload);
        });
      }
    );

    request.on("error", reject);

    if (init.body) {
      request.write(JSON.stringify(init.body));
    }

    request.end();
  });
}

function normalizeText(value: string) {
  return value.normalize("NFKC").replace(/\s+/g, "").toLowerCase();
}

function matchesPattern(text: string, pattern: RagEvalPattern) {
  if (pattern.type === "includes") {
    return normalizeText(text).includes(normalizeText(pattern.value));
  }

  return new RegExp(pattern.value, pattern.flags ?? "u").test(text);
}

function isGreetingOrClosing(message: string) {
  const normalized = normalizeText(message);
  return (
    normalized.startsWith(normalizeText("お電話ありがとうございます")) ||
    normalized.startsWith(normalizeText("お電話ありがとうございました"))
  );
}

function isLikelyFragment(message: string) {
  const trimmed = message.trim();
  if (!trimmed) {
    return false;
  }

  const normalized = normalizeText(trimmed);
  const knownBadFragments = [
    "恐れ入ります",
    "少々",
    "担当者におつな",
    "はいどのような",
    "line問",
    "line",
  ].map(normalizeText);

  if (knownBadFragments.includes(normalized)) {
    return true;
  }

  if (/[。！？]$/.test(trimmed)) {
    return false;
  }

  if (/(です|ます|ございました|ください|ございます)$/.test(trimmed)) {
    return false;
  }

  if (
    /(は|が|を|に|と|で|から|より|ので|けど|けれど|また|そして|について|おつな|グラ|初|line問)$/iu.test(
      trimmed
    )
  ) {
    return true;
  }

  if (trimmed.length <= 8) {
    return true;
  }

  return false;
}

function extractAgentAnswer(turns: SimulatedConversationTurn[]) {
  const messages = turns
    .filter(
      (turn) =>
        turn.role === "agent" &&
        typeof turn.message === "string" &&
        turn.message.trim().length > 0 &&
        !isGreetingOrClosing(turn.message)
    )
    .map((turn) => turn.message!.trim());

  return {
    messages,
    answerText: messages.join("\n"),
    fragmentMessages: messages.filter((message) => isLikelyFragment(message)),
  };
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

async function getAttachedKnowledgeBaseEntries(apiKey: string, agentId: string) {
  const agentUrl = new URL(`https://api.elevenlabs.io/v1/convai/agents/${agentId}`);
  const agent = await requestJson(agentUrl, {
    method: "GET",
    apiKey,
  });

  const entries = Array.isArray(agent?.conversation_config?.agent?.prompt?.knowledge_base)
    ? agent.conversation_config.agent.prompt.knowledge_base
    : [];

  return entries.flatMap((entry: any): AgentKnowledgeBaseEntry[] => {
    if (
      typeof entry?.id !== "string" ||
      entry.id.length === 0 ||
      typeof entry?.name !== "string" ||
      entry.name.length === 0
    ) {
      return [];
    }

    return [
      {
        id: entry.id,
        name: entry.name,
        usage_mode: typeof entry.usage_mode === "string" ? entry.usage_mode : undefined,
      },
    ];
  });
}

async function simulateCase(apiKey: string, agentId: string, evalCase: RagEvalCase) {
  const url = new URL(`https://api.elevenlabs.io/v1/convai/agents/${agentId}/simulate-conversation`);
  const response = await requestJson(url, {
    method: "POST",
    apiKey,
    body: {
      simulation_specification: {
        partial_conversation_history: [
          {
            role: "user",
            message: evalCase.userMessage,
            time_in_call_secs: 1,
          },
        ],
        simulated_user_config: {
          prompt: {
            prompt:
              "You are a silent caller in a regression test. After the agent gives its answer, say ==! END_CALL! == and do not ask any follow-up question.",
            llm: "gpt-4o-mini",
            temperature: 0,
          },
          language: "ja",
          disable_first_message_interruptions: false,
        },
      },
      new_turns_limit: evalCase.maxTurns ?? DEFAULT_NEW_TURNS_LIMIT,
    },
  });

  return response as SimulationResponse;
}

function scoreCase(
  evalCase: RagEvalCase,
  response: SimulationResponse,
  kbNameById: Map<string, string>
): CaseScore {
  const turns = Array.isArray(response.simulated_conversation) ? response.simulated_conversation : [];
  const { messages, answerText, fragmentMessages } = extractAgentAnswer(turns);
  const requiredPatterns = evalCase.requiredPatterns.filter((pattern) =>
    matchesPattern(answerText, pattern)
  );
  const missingPatterns = evalCase.requiredPatterns.filter(
    (pattern) => !matchesPattern(answerText, pattern)
  );
  const forbiddenPatterns = (evalCase.forbiddenPatterns ?? []).filter((pattern) =>
    matchesPattern(answerText, pattern)
  );

  const retrievedDocumentNames = new Set<string>();
  const retrievalQueries = new Set<string>();

  for (const turn of turns) {
    const retrievalInfo = turn.rag_retrieval_info;
    if (!retrievalInfo) {
      continue;
    }

    if (typeof retrievalInfo.retrieval_query === "string" && retrievalInfo.retrieval_query.trim()) {
      retrievalQueries.add(retrievalInfo.retrieval_query.trim());
    }

    for (const chunk of retrievalInfo.chunks ?? []) {
      if (typeof chunk.document_id !== "string" || chunk.document_id.length === 0) {
        continue;
      }

      const mappedName = kbNameById.get(chunk.document_id);
      if (mappedName) {
        retrievedDocumentNames.add(mappedName);
      }
    }
  }

  const retrievedNames = [...retrievedDocumentNames];
  const unexpectedRetrievedNames = retrievedNames.filter(
    (name) => !evalCase.expectedKnowledgeDocs.includes(name)
  );
  const expectedRetrievedNames = retrievedNames.filter((name) =>
    evalCase.expectedKnowledgeDocs.includes(name)
  );
  const retrievalObserved = retrievedNames.length > 0;
  const retrievalPrecision =
    retrievedNames.length > 0 ? expectedRetrievedNames.length / retrievedNames.length : null;
  const retrievalExpectedCoverage =
    evalCase.expectedKnowledgeDocs.length > 0
      ? expectedRetrievedNames.length / evalCase.expectedKnowledgeDocs.length
      : null;

  const passed =
    missingPatterns.length === 0 &&
    forbiddenPatterns.length === 0 &&
    fragmentMessages.length === 0 &&
    messages.length > 0;

  return {
    caseId: evalCase.id,
    description: evalCase.description,
    passed,
    critical: Boolean(evalCase.critical),
    matchedRequired: requiredPatterns.map((pattern) => pattern.value),
    missingRequired: missingPatterns.map((pattern) => pattern.value),
    matchedForbidden: forbiddenPatterns.map((pattern) => pattern.value),
    fragmentMessages,
    answerText,
    retrievedDocumentNames: retrievedNames,
    retrievedUnexpectedDocumentNames: unexpectedRetrievedNames,
    retrievalQueries: [...retrievalQueries],
    retrievalObserved,
    retrievalPrecision,
    retrievalExpectedCoverage,
  };
}

function renderMarkdownSummary(summary: EvalSummary) {
  const lines = [
    "# RAG Eval Summary",
    "",
    `- timestamp: ${summary.timestamp}`,
    `- agentId: ${summary.agentId}`,
    `- passRate: ${summary.passRate.toFixed(2)} (${summary.passedCases}/${summary.totalCases})`,
    `- criticalPassRate: ${summary.criticalPassRate.toFixed(2)} (${summary.criticalPassedCases}/${summary.criticalCases})`,
    `- retrievalObservedCases: ${summary.retrievalObservedCases}/${summary.totalCases}`,
    `- averageRetrievalPrecision: ${
      summary.averageRetrievalPrecision === null
        ? "n/a"
        : summary.averageRetrievalPrecision.toFixed(2)
    }`,
    `- averageRetrievalExpectedCoverage: ${
      summary.averageRetrievalExpectedCoverage === null
        ? "n/a"
        : summary.averageRetrievalExpectedCoverage.toFixed(2)
    }`,
    `- threshold: ${summary.threshold}`,
    `- criticalThreshold: ${summary.criticalThreshold}`,
    `- passed: ${summary.passed}`,
    "",
    "## Cases",
    "",
  ];

  for (const caseResult of summary.cases) {
    lines.push(`### ${caseResult.caseId}`);
    lines.push(`- passed: ${caseResult.passed}`);
    lines.push(`- critical: ${caseResult.critical}`);
    lines.push(`- missingRequired: ${caseResult.missingRequired.join(" | ") || "none"}`);
    lines.push(`- matchedForbidden: ${caseResult.matchedForbidden.join(" | ") || "none"}`);
    lines.push(`- fragmentMessages: ${caseResult.fragmentMessages.join(" | ") || "none"}`);
    lines.push(
      `- retrievedDocumentNames: ${caseResult.retrievedDocumentNames.join(" | ") || "none"}`
    );
    lines.push(
      `- retrievedUnexpectedDocumentNames: ${
        caseResult.retrievedUnexpectedDocumentNames.join(" | ") || "none"
      }`
    );
    lines.push(`- retrievalQueries: ${caseResult.retrievalQueries.join(" | ") || "none"}`);
    lines.push(`- answerText: ${caseResult.answerText || "(empty)"}`);
    lines.push("");
  }

  return lines.join("\n");
}

async function main() {
  loadDotenvFile();
  const { apiKey, agentId } = getServerConfig();
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const runDirectory = path.join(ARTIFACT_ROOT, timestamp);
  await mkdir(runDirectory, { recursive: true });

  const kbEntries: AgentKnowledgeBaseEntry[] = await getAttachedKnowledgeBaseEntries(apiKey, agentId);
  const kbNameById = new Map<string, string>(
    kbEntries.map((entry: AgentKnowledgeBaseEntry) => [entry.id, entry.name])
  );
  const caseScores: CaseScore[] = [];

  for (const evalCase of RAG_EVAL_CASES) {
    console.log(`Running case ${evalCase.id}...`);
    const response = await simulateCase(apiKey, agentId, evalCase);
    await writeFile(
      path.join(runDirectory, `${evalCase.id}.json`),
      JSON.stringify(response, null, 2),
      "utf8"
    );
    const score = scoreCase(evalCase, response, kbNameById);
    caseScores.push(score);
    console.log(
      `${evalCase.id}: passed=${score.passed} retrieval=${score.retrievedDocumentNames.join(",") || "none"}`
    );
  }

  const passedCases = caseScores.filter((score) => score.passed).length;
  const criticalCases = caseScores.filter((score) => score.critical).length;
  const criticalPassedCases = caseScores.filter((score) => score.critical && score.passed).length;
  const retrievalObservedCases = caseScores.filter((score) => score.retrievalObserved).length;
  const summary: EvalSummary = {
    timestamp,
    agentId,
    totalCases: caseScores.length,
    passedCases,
    passRate: passedCases / caseScores.length,
    criticalCases,
    criticalPassedCases,
    criticalPassRate: criticalCases > 0 ? criticalPassedCases / criticalCases : 1,
    retrievalObservedCases,
    averageRetrievalPrecision: average(
      caseScores.flatMap((score) =>
        score.retrievalPrecision === null ? [] : [score.retrievalPrecision]
      )
    ),
    averageRetrievalExpectedCoverage: average(
      caseScores.flatMap((score) =>
        score.retrievalExpectedCoverage === null ? [] : [score.retrievalExpectedCoverage]
      )
    ),
    threshold: RAG_EVAL_PASS_THRESHOLD,
    criticalThreshold: RAG_EVAL_CRITICAL_THRESHOLD,
    passed:
      passedCases / caseScores.length >= RAG_EVAL_PASS_THRESHOLD &&
      (criticalCases > 0 ? criticalPassedCases / criticalCases : 1) >=
        RAG_EVAL_CRITICAL_THRESHOLD,
    cases: caseScores,
  };

  await writeFile(
    path.join(runDirectory, "summary.json"),
    JSON.stringify(summary, null, 2),
    "utf8"
  );
  await writeFile(path.join(runDirectory, "summary.md"), renderMarkdownSummary(summary), "utf8");

  const latestSummaryPath = path.join(ARTIFACT_ROOT, "latest-summary.json");
  const latestMarkdownPath = path.join(ARTIFACT_ROOT, "latest-summary.md");
  await writeFile(latestSummaryPath, JSON.stringify(summary, null, 2), "utf8");
  await writeFile(latestMarkdownPath, renderMarkdownSummary(summary), "utf8");

  console.log(renderMarkdownSummary(summary));

  if (!summary.passed) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});

import { Agent as HttpsAgent, request as httpsRequest } from "node:https";

import { z } from "zod";

import { getServerConfig } from "@/lib/env";
import { writeDemoRunArtifacts } from "@/lib/demo-runs";
import { buildLatencySample, writeLatencySample } from "@/lib/latency";
import {
  maskPhoneNumber,
  normalizeConversationAnalysis,
  normalizeReservationMemo,
  normalizeTranscript,
} from "@/lib/elevenlabs/memo";
import type {
  AnalyzeConversationResponse,
  ConversationHistoryDetail,
  ConversationHistorySummary,
  DemoRun,
  OutboundCallResult,
} from "@/lib/types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const ELEVENLABS_HTTPS_AGENT = new HttpsAgent({ keepAlive: true });

const listConversationsSchema = z.object({
  conversations: z.array(
    z.object({
      agent_id: z.string().optional(),
      conversation_id: z.string(),
      conversation_initiation_source: z.string().optional(),
      start_time_unix_secs: z.number().nullable().optional(),
      call_duration_secs: z.number().nullable().optional(),
      status: z.string().optional(),
      call_successful: z.string().nullable().optional(),
      agent_name: z.string().optional(),
    })
  ),
  has_more: z.boolean().optional(),
  next_cursor: z.string().nullable().optional(),
});

const conversationDetailsSchema = z
  .object({
    agent_id: z.string().optional(),
    conversation_id: z.string(),
    status: z.string().optional(),
    transcript: z.array(z.record(z.string(), z.unknown())).optional(),
    analysis: z.record(z.string(), z.unknown()).nullable().optional(),
    metadata: z.record(z.string(), z.unknown()).nullable().optional(),
  })
  .passthrough();

const phoneNumbersSchema = z.array(
  z.object({
    phone_number: z.string(),
    label: z.string().nullable().optional(),
    supports_inbound: z.boolean().optional(),
    supports_outbound: z.boolean().optional(),
    phone_number_id: z.string(),
    assigned_agent: z.string().nullable().optional(),
    provider: z.string().optional(),
  })
);

const outboundCallSchema = z.object({
  success: z.boolean(),
  message: z.string(),
  conversation_id: z.string().nullable().optional(),
  callSid: z.string().nullable().optional(),
});

type ConversationDetails = z.infer<typeof conversationDetailsSchema>;
type ConversationListItem = z.infer<typeof listConversationsSchema>["conversations"][number];

export class ElevenLabsApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly payload?: unknown
  ) {
    super(message);
    this.name = "ElevenLabsApiError";
  }
}

function buildApiUrl(
  pathname: string,
  query?: Record<string, string | number | null | undefined>
) {
  const url = new URL(pathname, `${ELEVENLABS_API_BASE}/`);

  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value !== null && value !== undefined && value !== "") {
        url.searchParams.set(key, String(value));
      }
    }
  }

  return url;
}

type RawJsonResponse = {
  statusCode: number;
  payload: unknown;
};

function nodeRequestJson(
  url: URL,
  init: { method: string; headers?: Record<string, string>; body?: string }
): Promise<RawJsonResponse> {
  return new Promise((resolve, reject) => {
    const request = httpsRequest(
      url,
      {
        method: init.method,
        headers: init.headers,
        agent: ELEVENLABS_HTTPS_AGENT,
      },
      (response) => {
        let rawBody = "";

        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          rawBody += chunk;
        });
        response.on("end", () => {
          const contentType = response.headers["content-type"] ?? "";
          const payload = String(contentType).includes("application/json")
            ? rawBody
              ? JSON.parse(rawBody)
              : null
            : rawBody;

          resolve({
            statusCode: response.statusCode ?? 500,
            payload,
          });
        });
      }
    );

    request.on("error", (error) => {
      reject(error);
    });

    if (init.body) {
      request.write(init.body);
    }

    request.end();
  });
}

async function elevenLabsFetch<T>(
  input: URL,
  init: {
    method: string;
    headers?: Record<string, string>;
    body?: string;
  },
  schema: z.ZodType<T>
): Promise<T> {
  const { apiKey } = getServerConfig();

  let response: RawJsonResponse;
  try {
    response = await nodeRequestJson(input, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "xi-api-key": apiKey,
        ...(init.headers ?? {}),
      },
    });
  } catch (error) {
    const message =
      error instanceof Error ? `ElevenLabs request failed: ${error.message}` : "ElevenLabs request failed.";
    throw new ElevenLabsApiError(message, 502);
  }

  if (response.statusCode < 200 || response.statusCode >= 300) {
    const payload = response.payload;
    const message =
      typeof payload === "string"
        ? payload
        : typeof payload === "object" &&
            payload !== null &&
            "detail" in payload &&
            typeof payload.detail === "string"
          ? payload.detail
          : `ElevenLabs request failed with ${response.statusCode}`;

    throw new ElevenLabsApiError(message, response.statusCode, payload);
  }

  return schema.parse(response.payload);
}

function hasAnalysis(details: ConversationDetails): boolean {
  return Boolean(details.analysis);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isConversationDone(status: string | undefined): boolean {
  return status?.toLowerCase() === "done";
}

function toIsoFromUnix(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }
  return new Date(value * 1000).toISOString();
}

function normalizePhoneNumber(value: string): string {
  return value.replace(/[^\d+]/g, "");
}

function isSamePhoneNumber(left: string | null, right: string | null): boolean {
  if (!left || !right) {
    return false;
  }

  return normalizePhoneNumber(left) === normalizePhoneNumber(right);
}

function toNullableString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return null;
}

function normalizeAnalyzeResponse(details: ConversationDetails): AnalyzeConversationResponse {
  const transcript = normalizeTranscript(details.transcript);
  const analysis = normalizeConversationAnalysis(details.analysis);
  const memo = normalizeReservationMemo(details.analysis?.data_collection_results);

  return {
    conversationId: details.conversation_id,
    status: details.status ?? "unknown",
    transcript,
    analysis,
    memo,
  };
}

function normalizeDemoRun(details: ConversationDetails): DemoRun {
  const base = normalizeAnalyzeResponse(details);
  const metadata =
    details.metadata && typeof details.metadata === "object" ? details.metadata : {};
  const phoneCall =
    typeof metadata.phone_call === "object" && metadata.phone_call !== null
      ? (metadata.phone_call as Record<string, unknown>)
      : null;

  return {
    ...base,
    channel: phoneCall ? "phone" : "web",
    importedAt: new Date().toISOString(),
    callMeta: {
      startedAt: toIsoFromUnix(metadata.start_time_unix_secs),
      durationSecs:
        typeof metadata.call_duration_secs === "number"
          ? metadata.call_duration_secs
          : null,
      maskedCaller: maskPhoneNumber(
        typeof phoneCall?.external_number === "string"
          ? phoneCall.external_number
          : null
      ),
      agentNumber:
        typeof phoneCall?.agent_number === "string" ? phoneCall.agent_number : null,
      direction:
        typeof phoneCall?.direction === "string" ? phoneCall.direction : null,
    },
    cost: typeof metadata.cost === "number" ? metadata.cost : null,
    latency: buildLatencySample({
      conversationId: details.conversation_id,
      channel: phoneCall ? "phone" : "web",
      transport: phoneCall ? "telephony" : "unknown",
      transcript: base.transcript,
    }),
  };
}

function buildConversationSummary(
  details: ConversationDetails,
  source: string | null
): ConversationHistorySummary {
  const run = normalizeDemoRun(details);
  const transcriptCount = Array.isArray(details.transcript) ? details.transcript.length : 0;

  return {
    conversationId: details.conversation_id,
    channel: run.channel,
    source,
    status: details.status ?? null,
    durationSecs:
      typeof details.metadata?.call_duration_secs === "number"
        ? details.metadata.call_duration_secs
        : null,
    success: run.analysis.callSuccessful,
    startedAt: toIsoFromUnix(details.metadata?.start_time_unix_secs),
    analysisTitle: toNullableString(
      details.analysis && typeof details.analysis === "object"
        ? (details.analysis as Record<string, unknown>).call_summary_title
        : null
    ),
    transcriptSummary: run.analysis.transcriptSummary,
    memo: run.memo,
    latency: run.latency,
    transcriptCount,
  };
}

function summarizeConversationSource(item: ConversationListItem, details: ConversationDetails) {
  if (typeof item.conversation_initiation_source === "string") {
    return item.conversation_initiation_source;
  }

  if (
    details.metadata &&
    typeof details.metadata === "object" &&
    "phone_call" in details.metadata &&
    typeof details.metadata.phone_call === "object" &&
    details.metadata.phone_call !== null
  ) {
    return "twilio";
  }

  return "web";
}

async function resolveConversationRun(conversationId: string): Promise<ConversationDetails> {
  let details = await runConversationAnalysis(conversationId);

  for (let attempt = 0; attempt < 10 && !hasAnalysis(details); attempt += 1) {
    await sleep(1500);
    details = await getConversationDetails(conversationId);
  }

  return details;
}

export async function getConversationToken(agentId?: string): Promise<string> {
  const config = getServerConfig();
  const response = await elevenLabsFetch(
    buildApiUrl("convai/conversation/token", {
      agent_id: agentId ?? config.agentId,
    }),
    { method: "GET" },
    z.object({ token: z.string() })
  );

  return response.token;
}

export async function getSignedUrl(agentId?: string): Promise<string> {
  const config = getServerConfig();
  const response = await elevenLabsFetch(
    buildApiUrl("convai/conversation/get-signed-url", {
      agent_id: agentId ?? config.agentId,
    }),
    { method: "GET" },
    z.object({ signed_url: z.string().url() })
  );

  return response.signed_url;
}

export async function listConversations(pageSize = 20) {
  const config = getServerConfig();
  return elevenLabsFetch(
    buildApiUrl("convai/conversations", {
      agent_id: config.agentId,
      page_size: pageSize,
    }),
    { method: "GET" },
    listConversationsSchema
  );
}

export async function listPhoneNumbers() {
  return elevenLabsFetch(
    buildApiUrl("convai/phone-numbers"),
    { method: "GET" },
    phoneNumbersSchema
  );
}

async function resolveAgentPhoneNumber() {
  const config = getServerConfig();
  const phoneNumbers = await listPhoneNumbers();
  const outboundCapable = phoneNumbers.filter(
    (item) => item.supports_outbound !== false
  );

  const configuredNumber = config.agentPhoneNumber
    ? normalizePhoneNumber(config.agentPhoneNumber)
    : null;

  if (configuredNumber) {
    const matched = outboundCapable.find(
      (item) => normalizePhoneNumber(item.phone_number) === configuredNumber
    );
    if (matched) {
      return matched;
    }
  }

  if (outboundCapable.length === 1) {
    return outboundCapable[0];
  }

  throw new Error(
    "Could not resolve an outbound-capable ElevenLabs phone number. Set ELEVENLABS_AGENT_PHONE_NUMBER to an imported Twilio number."
  );
}

export async function startOutboundCall(toNumber: string): Promise<OutboundCallResult> {
  const config = getServerConfig();
  if (isSamePhoneNumber(toNumber, config.agentPhoneNumber) || isSamePhoneNumber(toNumber, config.twilioCallerId)) {
    throw new Error(
      "発信先番号が発信元番号と同じです。DEMO_OUTBOUND_TARGET_NUMBER か画面入力欄に、実際に受ける別の番号を指定してください。"
    );
  }

  const phoneNumber = await resolveAgentPhoneNumber();
  const response = await elevenLabsFetch(
    buildApiUrl("convai/twilio/outbound-call"),
    {
      method: "POST",
      body: JSON.stringify({
        agent_id: config.agentId,
        agent_phone_number_id: phoneNumber.phone_number_id,
        to_number: toNumber,
      }),
    },
    outboundCallSchema
  );

  return {
    success: response.success,
    message: response.message,
    conversationId: response.conversation_id ?? null,
    callSid: response.callSid ?? null,
    agentPhoneNumberId: phoneNumber.phone_number_id,
    agentPhoneNumber: phoneNumber.phone_number,
    toNumber,
  };
}

export async function getConversationDetails(conversationId: string) {
  return elevenLabsFetch(
    buildApiUrl(`convai/conversations/${conversationId}`),
    { method: "GET" },
    conversationDetailsSchema
  );
}

export async function runConversationAnalysis(conversationId: string) {
  return elevenLabsFetch(
    buildApiUrl(`convai/conversations/${conversationId}/analysis/run`),
    {
      method: "POST",
      body: JSON.stringify({}),
    },
    conversationDetailsSchema
  );
}

export async function analyzeConversation(
  conversationId: string
): Promise<AnalyzeConversationResponse> {
  const details = await resolveConversationRun(conversationId);
  return normalizeAnalyzeResponse(details);
}

export async function getConversationHistoryDetail(
  conversationId: string
): Promise<ConversationHistoryDetail> {
  const details = await resolveConversationRun(conversationId);
  const recent = await listConversations(20);
  const matched = recent.conversations.find(
    (item) => item.conversation_id === conversationId
  );

  return {
    ...normalizeDemoRun(details),
    source: matched?.conversation_initiation_source ?? summarizeConversationSource(
      {
        conversation_id: conversationId,
        conversation_initiation_source: undefined,
        start_time_unix_secs: undefined,
        call_duration_secs: undefined,
        status: details.status,
        call_successful: undefined,
        agent_name: undefined,
        agent_id: details.agent_id,
      },
      details
    ),
    status: details.status ?? "unknown",
  };
}

export async function listConversationHistorySummaries(
  pageSize = 8
): Promise<ConversationHistorySummary[]> {
  const recent = await listConversations(pageSize);
  const conversations = [...recent.conversations].sort(
    (left, right) =>
      (right.start_time_unix_secs ?? 0) - (left.start_time_unix_secs ?? 0)
  );

  const completed = conversations.filter((candidate) => candidate.status?.toLowerCase() === "done");
  const selected = completed.slice(0, pageSize);

  const details = await Promise.all(
    selected.map((candidate) => getConversationDetails(candidate.conversation_id))
  );

  return details.map((detail, index) =>
    buildConversationSummary(detail, summarizeConversationSource(selected[index], detail))
  );
}

async function findMostRecentPhoneConversationId(): Promise<string> {
  const recent = await listConversations(20);
  const candidates = [...recent.conversations].sort(
    (left, right) =>
      (right.start_time_unix_secs ?? 0) - (left.start_time_unix_secs ?? 0)
  );

  for (const candidate of candidates) {
    if (!isConversationDone(candidate.status)) {
      continue;
    }

    const details = await getConversationDetails(candidate.conversation_id);
    const phoneCall =
      details.metadata &&
      typeof details.metadata === "object" &&
      "phone_call" in details.metadata &&
      typeof details.metadata.phone_call === "object" &&
      details.metadata.phone_call !== null;

    if (phoneCall) {
      return candidate.conversation_id;
    }
  }

  throw new Error(
    "No completed phone conversation was found for the configured agent."
  );
}

export async function importLatestPhoneCall(conversationId?: string): Promise<DemoRun> {
  const targetConversationId = conversationId ?? (await findMostRecentPhoneConversationId());
  const details = await resolveConversationRun(targetConversationId);
  const run = normalizeDemoRun(details);
  if (run.latency) {
    await writeLatencySample(run.latency);
  }

  return run;
}

export async function persistLatestPhoneCall(conversationId?: string) {
  const run = await importLatestPhoneCall(conversationId);
  return writeDemoRunArtifacts(run, getServerConfig().demoTimezone);
}

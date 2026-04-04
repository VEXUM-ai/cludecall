import { z } from "zod";

import { getServerConfig } from "@/lib/env";
import { writeDemoRunArtifacts } from "@/lib/demo-runs";
import {
  maskPhoneNumber,
  normalizeConversationAnalysis,
  normalizeReservationMemo,
  normalizeTranscript,
} from "@/lib/elevenlabs/memo";
import type { AnalyzeConversationResponse, DemoRun } from "@/lib/types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";

const listConversationsSchema = z.object({
  conversations: z.array(
    z.object({
      agent_id: z.string().optional(),
      conversation_id: z.string(),
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

type ConversationDetails = z.infer<typeof conversationDetailsSchema>;

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

async function readErrorPayload(response: Response): Promise<unknown> {
  const contentType = response.headers.get("content-type") ?? "";
  if (contentType.includes("application/json")) {
    return response.json();
  }
  return response.text();
}

async function elevenLabsFetch<T>(
  input: URL,
  init: RequestInit,
  schema: z.ZodType<T>
): Promise<T> {
  const { apiKey } = getServerConfig();
  const response = await fetch(input, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      "xi-api-key": apiKey,
      ...(init.headers ?? {}),
    },
    cache: "no-store",
  });

  if (!response.ok) {
    const payload = await readErrorPayload(response);
    const message =
      typeof payload === "string"
        ? payload
        : typeof payload === "object" &&
            payload !== null &&
            "detail" in payload &&
            typeof payload.detail === "string"
          ? payload.detail
          : `ElevenLabs request failed with ${response.status}`;

    throw new ElevenLabsApiError(message, response.status, payload);
  }

  const payload = await response.json();
  return schema.parse(payload);
}

function hasAnalysis(details: ConversationDetails): boolean {
  return Boolean(details.analysis);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function toIsoFromUnix(value: unknown): string | null {
  if (typeof value !== "number") {
    return null;
  }
  return new Date(value * 1000).toISOString();
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
  };
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
  let details = await runConversationAnalysis(conversationId);

  for (let attempt = 0; attempt < 10 && !hasAnalysis(details); attempt += 1) {
    await sleep(1500);
    details = await getConversationDetails(conversationId);
  }

  return normalizeAnalyzeResponse(details);
}

async function findMostRecentPhoneConversationId(): Promise<string> {
  const recent = await listConversations(20);
  const candidates = [...recent.conversations].sort(
    (left, right) =>
      (right.start_time_unix_secs ?? 0) - (left.start_time_unix_secs ?? 0)
  );

  for (const candidate of candidates) {
    if (candidate.status?.toLowerCase() === "in-progress") {
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
  let details = await runConversationAnalysis(targetConversationId);

  for (let attempt = 0; attempt < 10 && !hasAnalysis(details); attempt += 1) {
    await sleep(1500);
    details = await getConversationDetails(targetConversationId);
  }

  return normalizeDemoRun(details);
}

export async function persistLatestPhoneCall(conversationId?: string) {
  const run = await importLatestPhoneCall(conversationId);
  return writeDemoRunArtifacts(run, getServerConfig().demoTimezone);
}

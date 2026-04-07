import { Agent as HttpsAgent, request as httpsRequest } from "node:https";

import { z } from "zod";

import { readStoredAppointmentDraft } from "@/lib/appointment-store";
import { buildAppointmentDraft } from "@/lib/appointments";
import { getServerConfig } from "@/lib/env";
import {
  listStoredDemoRunArtifacts,
  readLastKnownPhoneConversationId,
  readStoredDemoRun,
  writeDemoRunArtifacts,
  writeLastKnownPhoneConversationId,
} from "@/lib/demo-runs";
import { buildLatencySample, writeLatencySample } from "@/lib/latency";
import {
  maskPhoneNumber,
  normalizeConversationAnalysis,
  normalizeReservationMemo,
  normalizeTranscript,
} from "@/lib/elevenlabs/memo";
import type {
  AnalyzeConversationResponse,
  AnalysisResolutionMetrics,
  ConversationAnalysisState,
  ConversationHistoryDetail,
  ConversationHistorySummary,
  DemoRun,
  OutboundCallResult,
} from "@/lib/types";

const ELEVENLABS_API_BASE = "https://api.elevenlabs.io/v1";
const TWILIO_DEFAULT_API_BASE = "https://api.twilio.com/2010-04-01";
const ELEVENLABS_HTTPS_AGENT = new HttpsAgent({ keepAlive: true });
const OUTBOUND_CACHE_TTL_MS = 5 * 60 * 1000;

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

const twilioAccountSchema = z.object({
  type: z.string().nullable().optional(),
});

type ConversationDetails = z.infer<typeof conversationDetailsSchema>;
type ConversationListItem = z.infer<typeof listConversationsSchema>["conversations"][number];
type PhoneNumberRecord = z.infer<typeof phoneNumbersSchema>[number];
type TimedResult<T> = {
  result: T;
  elapsedMs: number;
};
type CachedLookupResult<T> = {
  value: T;
  cacheHit: boolean | null;
};
type CacheEntry<T> = {
  expiresAt: number;
  value: T;
};

const twilioAccountTypeCache = new Map<string, CacheEntry<string | null>>();

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

function buildTwilioApiUrl(pathname: string) {
  const edge = process.env.TWILIO_API_EDGE?.trim();
  const region = process.env.TWILIO_API_REGION?.trim();
  const baseUrl =
    edge && region
      ? `https://api.${edge}.${region}.twilio.com/2010-04-01`
      : TWILIO_DEFAULT_API_BASE;

  return new URL(pathname, `${baseUrl}/`);
}

function readCache<T>(cache: Map<string, CacheEntry<T>>, key: string): T | null {
  const entry = cache.get(key);
  if (!entry) {
    return null;
  }

  if (entry.expiresAt <= Date.now()) {
    cache.delete(key);
    return null;
  }

  return entry.value;
}

function writeCache<T>(cache: Map<string, CacheEntry<T>>, key: string, value: T) {
  cache.set(key, {
    value,
    expiresAt: Date.now() + OUTBOUND_CACHE_TTL_MS,
  });
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

async function measureAsync<T>(operation: () => Promise<T>): Promise<TimedResult<T>> {
  const startedAt = Date.now();
  const result = await operation();
  return {
    result,
    elapsedMs: Date.now() - startedAt,
  };
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

async function twilioFetch<T>(input: URL, schema: z.ZodType<T>): Promise<T> {
  const config = getServerConfig();

  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    throw new Error("Missing Twilio credentials.");
  }

  const basicAuth = Buffer.from(
    `${config.twilioAccountSid}:${config.twilioAuthToken}`,
    "utf8"
  ).toString("base64");

  const response = await nodeRequestJson(input, {
    method: "GET",
    headers: {
      Authorization: `Basic ${basicAuth}`,
    },
  });

  if (response.statusCode < 200 || response.statusCode >= 300) {
    throw new Error(`Twilio request failed with ${response.statusCode}`);
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

function buildBaseAnalyzeResponse(details: ConversationDetails) {
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

async function normalizeAnalyzeResponse(
  details: ConversationDetails,
  analysisResolution: AnalysisResolutionMetrics | null = null
): Promise<AnalyzeConversationResponse> {
  const base = buildBaseAnalyzeResponse(details);
  const metadata =
    details.metadata && typeof details.metadata === "object" ? details.metadata : {};
  const phoneCall =
    typeof metadata.phone_call === "object" && metadata.phone_call !== null
      ? (metadata.phone_call as Record<string, unknown>)
      : null;
  const storedDraft = await readStoredAppointmentDraft(details.conversation_id);

  return {
    ...base,
    appointmentDraft: buildAppointmentDraft({
      conversationId: details.conversation_id,
      memo: base.memo,
      transcript: base.transcript,
      channel: phoneCall ? "phone" : "web",
      anchorAt: toIsoFromUnix(metadata.start_time_unix_secs),
      storedDraft,
    }),
    analysisResolution,
  };
}

async function normalizeDemoRun(
  details: ConversationDetails,
  analysisResolution: AnalysisResolutionMetrics | null = null
): Promise<DemoRun> {
  const base = await normalizeAnalyzeResponse(details, analysisResolution);
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
      analysisMs: analysisResolution?.totalMs ?? null,
    }),
  };
}

async function buildConversationSummary(
  details: ConversationDetails,
  source: string | null
): Promise<ConversationHistorySummary> {
  const run = await normalizeDemoRun(details);
  const transcriptCount = Array.isArray(details.transcript) ? details.transcript.length : 0;
  const analysisState = resolveAnalysisState(details);

  return {
    conversationId: details.conversation_id,
    channel: run.channel,
    source,
    status: details.status ?? null,
    analysisState,
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
    appointmentDraft: run.appointmentDraft,
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

function resolveAnalysisState(details: ConversationDetails): ConversationAnalysisState {
  if (hasAnalysis(details)) {
    return "ready";
  }

  return isConversationDone(details.status) ? "missing" : "pending";
}

function inferStoredConversationSource(run: DemoRun): string {
  return run.channel === "phone" ? "twilio" : "web";
}

function deriveAnalysisTitle(summary: string | null) {
  if (!summary) {
    return null;
  }

  const trimmed = summary.trim();
  if (trimmed.length === 0) {
    return null;
  }

  return trimmed.length > 72 ? `${trimmed.slice(0, 72)}...` : trimmed;
}

function toHistoryTimestamp(value: string | null): number {
  if (!value) {
    return 0;
  }

  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function buildConversationSummaryFromStoredRun(
  run: DemoRun,
  source: string | null
): ConversationHistorySummary {
  return {
    conversationId: run.conversationId,
    channel: run.channel,
    source,
    status: run.status,
    analysisState: "ready",
    durationSecs: run.callMeta.durationSecs,
    success: run.analysis.callSuccessful,
    startedAt: run.callMeta.startedAt,
    analysisTitle: deriveAnalysisTitle(run.analysis.transcriptSummary),
    transcriptSummary: run.analysis.transcriptSummary,
    memo: run.memo,
    latency: run.latency,
    transcriptCount: run.transcript.length,
    appointmentDraft: run.appointmentDraft,
  };
}

function buildConversationHistoryDetailFromStoredRun(
  run: DemoRun,
  source: string | null
): ConversationHistoryDetail {
  return {
    ...run,
    source,
    status: run.status,
    analysisState: "ready",
  };
}

async function persistDemoRunFromDetails(
  details: ConversationDetails,
  analysisResolution: AnalysisResolutionMetrics | null = null
) {
  const run = await normalizeDemoRun(details, analysisResolution);
  await writeDemoRunArtifacts(run, getServerConfig().demoTimezone);
  if (run.channel === "phone") {
    await writeLastKnownPhoneConversationId(run.conversationId);
  }
  return run;
}

async function resolveConversationRun(
  conversationId: string,
  options: {
    allowAnalysisRerun?: boolean;
  } = {}
): Promise<{
  details: ConversationDetails;
  analysisResolution: AnalysisResolutionMetrics;
}> {
  const totalStartedAt = Date.now();
  const initialDetail = await measureAsync(() => getConversationDetails(conversationId));
  let details = initialDetail.result;
  let pollingAttempts = 0;
  let pollingWaitMs = 0;
  let detailFetchCount = 1;
  let detailFetchMs = initialDetail.elapsedMs;
  let analysisRequestMs = 0;

  if (options.allowAnalysisRerun === false || (isConversationDone(details.status) && hasAnalysis(details))) {
    return {
      details,
      analysisResolution: {
        analysisRequestMs,
        pollingAttempts,
        pollingWaitMs,
        detailFetchCount,
        detailFetchMs,
        totalMs: Date.now() - totalStartedAt,
      },
    };
  }

  const initial = await measureAsync(() => runConversationAnalysis(conversationId));
  analysisRequestMs = initial.elapsedMs;
  details = initial.result;
  const pollingBackoffMs = [400, 900, 1800, 3200, 5000];

  for (let attempt = 0; attempt < pollingBackoffMs.length && !hasAnalysis(details); attempt += 1) {
    pollingAttempts += 1;
    const waitStartedAt = Date.now();
    await sleep(pollingBackoffMs[attempt]);
    pollingWaitMs += Date.now() - waitStartedAt;
    const detailResponse = await measureAsync(() => getConversationDetails(conversationId));
    detailFetchCount += 1;
    detailFetchMs += detailResponse.elapsedMs;
    details = detailResponse.result;
  }

  return {
    details,
    analysisResolution: {
      analysisRequestMs,
      pollingAttempts,
      pollingWaitMs,
      detailFetchCount,
      detailFetchMs,
      totalMs: Date.now() - totalStartedAt,
    },
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
      return {
        value: matched,
        cacheHit: false,
      } satisfies CachedLookupResult<PhoneNumberRecord>;
    }
  }

  if (outboundCapable.length === 1) {
    return {
      value: outboundCapable[0],
      cacheHit: false,
    } satisfies CachedLookupResult<PhoneNumberRecord>;
  }

  throw new Error(
    "Could not resolve an outbound-capable ElevenLabs phone number. Set ELEVENLABS_AGENT_PHONE_NUMBER to an imported Twilio number."
  );
}

async function getTwilioAccountType(): Promise<CachedLookupResult<string | null>> {
  const config = getServerConfig();

  if (!config.twilioAccountSid || !config.twilioAuthToken) {
    return {
      value: null,
      cacheHit: null,
    };
  }

  const cacheKey = config.twilioAccountSid;
  const cachedAccountType = readCache(twilioAccountTypeCache, cacheKey);
  if (cachedAccountType !== null) {
    return {
      value: cachedAccountType,
      cacheHit: true,
    };
  }

  try {
    const response = await twilioFetch(
      buildTwilioApiUrl(`Accounts/${config.twilioAccountSid}.json`),
      twilioAccountSchema
    );

    const accountType = response.type ?? null;
    writeCache(twilioAccountTypeCache, cacheKey, accountType);
    return {
      value: accountType,
      cacheHit: false,
    };
  } catch {
    return {
      value: null,
      cacheHit: false,
    };
  }
}

export async function startOutboundCall(toNumber: string): Promise<OutboundCallResult> {
  const totalStartedAt = Date.now();
  const config = getServerConfig();
  if (isSamePhoneNumber(toNumber, config.agentPhoneNumber) || isSamePhoneNumber(toNumber, config.twilioCallerId)) {
    throw new Error(
      "発信先番号が発信元番号と同じです。DEMO_OUTBOUND_TARGET_NUMBER か画面入力欄に、実際に受ける別の番号を指定してください。"
    );
  }

  const twilioAccountTypePromise = measureAsync(() => getTwilioAccountType());
  const configuredPhoneNumberId = config.agentPhoneNumberId?.trim() || null;
  const phoneNumberResult = configuredPhoneNumberId
    ? null
    : await measureAsync(() => resolveAgentPhoneNumber());
  const agentPhoneNumberId =
    configuredPhoneNumberId ?? phoneNumberResult?.result.value.phone_number_id ?? null;

  if (!agentPhoneNumberId) {
    throw new Error(
      "Missing ELEVENLABS_AGENT_PHONE_NUMBER_ID. Set a fixed outbound-capable ElevenLabs phone number id for this demo."
    );
  }

  const outboundResponse = await measureAsync(() =>
    elevenLabsFetch(
      buildApiUrl("convai/twilio/outbound-call"),
      {
        method: "POST",
        body: JSON.stringify({
          agent_id: config.agentId,
          agent_phone_number_id: agentPhoneNumberId,
          to_number: toNumber,
        }),
      },
      outboundCallSchema
    )
  );
  const twilioAccountTypeResult = await twilioAccountTypePromise;
  const response = outboundResponse.result;
  const twilioAccountType = twilioAccountTypeResult.result.value;
  const totalMs = Date.now() - totalStartedAt;
  const agentPhoneNumber =
    config.agentPhoneNumber ?? phoneNumberResult?.result.value.phone_number ?? null;

  if (response.conversation_id) {
    await writeLastKnownPhoneConversationId(response.conversation_id);
  }

  const warnings: string[] = [];
  if (twilioAccountType?.toLowerCase() === "trial") {
    warnings.push(
      "Twilio アカウントが Trial のため、接続直後に英語の trial アナウンスが先に流れます。ElevenLabs の Twilio native integration は paid Twilio account 前提の案内があり、Trial では AI 会話が始まらず切れることがあります。"
    );
  }

  return {
    success: response.success,
    message: response.message,
    conversationId: response.conversation_id ?? null,
    callSid: response.callSid ?? null,
    agentPhoneNumberId,
    agentPhoneNumber,
    toNumber,
    twilioAccountType,
    warnings,
    outboundMetrics: {
      resolvePhoneNumberMs: phoneNumberResult?.elapsedMs ?? 0,
      phoneNumberCacheHit:
        configuredPhoneNumberId !== null
          ? true
          : phoneNumberResult?.result.cacheHit ?? false,
      twilioAccountLookupMs: twilioAccountTypeResult.elapsedMs,
      twilioAccountTypeCacheHit: twilioAccountTypeResult.result.cacheHit,
      outboundRequestMs: outboundResponse.elapsedMs,
      totalMs,
    },
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
  const resolved = await resolveConversationRun(conversationId, {
    allowAnalysisRerun: true,
  });
  const [result] = await Promise.all([
    normalizeAnalyzeResponse(resolved.details, resolved.analysisResolution),
    persistDemoRunFromDetails(resolved.details, resolved.analysisResolution),
  ]);
  return result;
}

export async function getConversationHistoryDetail(
  conversationId: string
): Promise<ConversationHistoryDetail> {
  const stored = await readStoredDemoRun(conversationId);
  if (stored) {
    return buildConversationHistoryDetailFromStoredRun(
      stored.run,
      inferStoredConversationSource(stored.run)
    );
  }

  const details = await getConversationDetails(conversationId);
  const run = await normalizeDemoRun(details);
  const detail: ConversationHistoryDetail = {
    ...run,
    source: summarizeConversationSource(
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
    analysisState: resolveAnalysisState(details),
  };

  if (detail.analysisState === "ready") {
    await persistDemoRunFromDetails(details);
  }

  return detail;
}

export async function listConversationHistorySummaries(
  pageSize = 8
): Promise<ConversationHistorySummary[]> {
  const storedSummaries = (await listStoredDemoRunArtifacts())
    .slice(0, pageSize)
    .map((artifact) =>
      buildConversationSummaryFromStoredRun(
        artifact.run,
        inferStoredConversationSource(artifact.run)
      )
    );

  if (storedSummaries.length >= pageSize) {
    return storedSummaries;
  }

  const recent = await listConversations(Math.min(20, Math.max(pageSize * 2, 12)));
  const conversations = [...recent.conversations].sort(
    (left, right) =>
      (right.start_time_unix_secs ?? 0) - (left.start_time_unix_secs ?? 0)
  );
  const storedConversationIds = new Set(storedSummaries.map((item) => item.conversationId));
  const selected = conversations
    .filter((candidate) => !storedConversationIds.has(candidate.conversation_id))
    .slice(0, Math.max(pageSize - storedSummaries.length, 0));

  const details = await Promise.all(
    selected.map((candidate) => getConversationDetails(candidate.conversation_id))
  );

  const remoteSummaries = await Promise.all(
    details.map((detail, index) =>
      buildConversationSummary(detail, summarizeConversationSource(selected[index], detail))
    )
  );

  return [...storedSummaries, ...remoteSummaries]
    .sort(
      (left, right) =>
        toHistoryTimestamp(right.startedAt) - toHistoryTimestamp(left.startedAt)
    )
    .slice(0, pageSize);
}

function isPhoneConversationCandidate(
  item: ConversationListItem | null,
  details: ConversationDetails
) {
  if (item?.conversation_initiation_source?.toLowerCase() === "twilio") {
    return true;
  }

  return (
    details.metadata &&
    typeof details.metadata === "object" &&
    "phone_call" in details.metadata &&
    typeof details.metadata.phone_call === "object" &&
    details.metadata.phone_call !== null
  );
}

async function resolveMostRecentPhoneConversationId(doneOnly: boolean): Promise<string> {
  const lastKnownConversationId = await readLastKnownPhoneConversationId();
  if (lastKnownConversationId) {
    try {
      const details = await getConversationDetails(lastKnownConversationId);
      if (
        isPhoneConversationCandidate(null, details) &&
        (!doneOnly || isConversationDone(details.status))
      ) {
        return lastKnownConversationId;
      }
    } catch {
      // Ignore stale cache and fall back to recent conversation lookup.
    }
  }

  const recent = await listConversations(20);
  const candidates = [...recent.conversations].sort(
    (left, right) =>
      (right.start_time_unix_secs ?? 0) - (left.start_time_unix_secs ?? 0)
  );
  const filteredCandidates = candidates.filter((candidate) =>
    doneOnly ? isConversationDone(candidate.status) : !isConversationDone(candidate.status)
  );
  const details = await Promise.all(
    filteredCandidates.map(async (candidate) => ({
      candidate,
      details: await getConversationDetails(candidate.conversation_id),
    }))
  );
  const matched = details.find(({ candidate, details }) =>
    isPhoneConversationCandidate(candidate, details)
  );

  if (matched) {
    await writeLastKnownPhoneConversationId(matched.candidate.conversation_id);
    return matched.candidate.conversation_id;
  }

  throw new Error(
    doneOnly
      ? "No completed phone conversation was found for the configured agent."
      : "No active phone conversation was found for the configured agent."
  );
}

async function findMostRecentPhoneConversationId(): Promise<string> {
  return resolveMostRecentPhoneConversationId(true);
}

export async function findMostRecentActivePhoneConversationId(): Promise<string> {
  return resolveMostRecentPhoneConversationId(false);
}

export async function importLatestPhoneCall(conversationId?: string): Promise<DemoRun> {
  const targetConversationId = conversationId ?? (await findMostRecentPhoneConversationId());
  const resolved = await resolveConversationRun(targetConversationId, {
    allowAnalysisRerun: true,
  });
  const run = await persistDemoRunFromDetails(resolved.details, resolved.analysisResolution);
  if (run.latency) {
    await writeLatencySample(run.latency);
  }

  return run;
}

export async function reanalyzeConversationHistoryDetail(
  conversationId: string
): Promise<ConversationHistoryDetail> {
  const resolved = await resolveConversationRun(conversationId, {
    allowAnalysisRerun: true,
  });
  const run = await persistDemoRunFromDetails(resolved.details, resolved.analysisResolution);
  return buildConversationHistoryDetailFromStoredRun(
    run,
    inferStoredConversationSource(run)
  );
}

export async function persistLatestPhoneCall(conversationId?: string) {
  const run = await importLatestPhoneCall(conversationId);
  return writeDemoRunArtifacts(run, getServerConfig().demoTimezone);
}

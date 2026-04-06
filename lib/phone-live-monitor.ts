import WebSocket from "ws";

import { getServerConfig } from "@/lib/env";
import { appendLiveMonitorEvent } from "@/lib/live-monitor";

type MonitorStartResult = {
  conversationId: string;
  started: boolean;
  alreadyActive: boolean;
};

type ActivePhoneMonitor = {
  conversationId: string;
  socket: WebSocket | null;
  attempts: number;
  opened: boolean;
  stopped: boolean;
  startedAtMs: number;
  lastUserTranscriptAtMs: number | null;
  lastAgentText: string | null;
  writeChain: Promise<void>;
  retryTimer: NodeJS.Timeout | null;
};

type MonitorEventPayload = {
  type?: string;
  user_transcription_event?: {
    user_transcript?: string;
  };
  agent_response_event?: {
    agent_response?: string;
  };
  agent_response_correction_event?: {
    corrected_agent_response?: string;
    original_agent_response?: string;
  };
  conversation_initiation_metadata_event?: {
    conversation_id?: string;
  };
  ping_event?: {
    event_id?: number;
    ping_ms?: number;
  };
};

const MONITOR_RETRY_MS = 1500;
const MONITOR_MAX_ATTEMPTS = 20;
const activeMonitors = new Map<string, ActivePhoneMonitor>();

function buildMonitorUrl(conversationId: string) {
  return `wss://api.elevenlabs.io/v1/convai/conversations/${conversationId}/monitor`;
}

function normalizeText(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function queueMonitorWrite(
  monitor: ActivePhoneMonitor,
  payload: Parameters<typeof appendLiveMonitorEvent>[0]
) {
  monitor.writeChain = monitor.writeChain
    .then(async () => {
      await appendLiveMonitorEvent(payload);
    })
    .catch(() => undefined);
}

function stopMonitor(conversationId: string) {
  const monitor = activeMonitors.get(conversationId);
  if (!monitor) {
    return;
  }

  monitor.stopped = true;
  if (monitor.retryTimer) {
    clearTimeout(monitor.retryTimer);
    monitor.retryTimer = null;
  }
  if (monitor.socket && monitor.socket.readyState === WebSocket.OPEN) {
    monitor.socket.close();
  }
  activeMonitors.delete(conversationId);
}

function maybeScheduleRetry(
  monitor: ActivePhoneMonitor,
  reason: string,
  options?: { fatal?: boolean; details?: Record<string, unknown> | null }
) {
  if (monitor.stopped) {
    return;
  }

  const fatal = options?.fatal ?? false;
  const nextAttempt = monitor.attempts + 1;
  const exceeded = nextAttempt >= MONITOR_MAX_ATTEMPTS;

  queueMonitorWrite(monitor, {
    kind: fatal ? "error" : "session",
    channel: "phone",
    level: fatal || exceeded ? "error" : "warning",
    conversationId: monitor.conversationId,
    message:
      fatal || exceeded ? `phone realtime monitor failed: ${reason}` : `phone realtime monitor retrying: ${reason}`,
    details: {
      attempt: nextAttempt,
      maxAttempts: MONITOR_MAX_ATTEMPTS,
      ...(options?.details ?? {}),
    },
  });

  if (fatal || exceeded) {
    stopMonitor(monitor.conversationId);
    return;
  }

  monitor.retryTimer = setTimeout(() => {
    monitor.retryTimer = null;
    void connectMonitor(monitor);
  }, MONITOR_RETRY_MS);
}

function handleMonitorEvent(monitor: ActivePhoneMonitor, payload: MonitorEventPayload) {
  const eventType = payload.type;

  if (!eventType) {
    return;
  }

  if (eventType === "ping") {
    if (monitor.socket?.readyState === WebSocket.OPEN) {
      monitor.socket.send("pong");
    }
    return;
  }

  if (eventType === "conversation_initiation_metadata") {
    queueMonitorWrite(monitor, {
      kind: "session",
      channel: "phone",
      level: "success",
      conversationId: monitor.conversationId,
      message: "phone realtime monitor connected",
      details: {
        conversationId:
          normalizeText(payload.conversation_initiation_metadata_event?.conversation_id) ??
          monitor.conversationId,
      },
    });
    return;
  }

  if (eventType === "user_transcript") {
    const text = normalizeText(payload.user_transcription_event?.user_transcript);
    if (!text) {
      return;
    }

    monitor.lastUserTranscriptAtMs = Date.now();
    queueMonitorWrite(monitor, {
      kind: "user",
      channel: "phone",
      level: "info",
      conversationId: monitor.conversationId,
      message: text,
      details: {
        elapsedMs: Date.now() - monitor.startedAtMs,
        tentative: false,
      },
    });
    return;
  }

  if (eventType === "agent_response") {
    const text = normalizeText(payload.agent_response_event?.agent_response);
    if (!text) {
      return;
    }

    const replyAfterUserMs =
      monitor.lastUserTranscriptAtMs !== null
        ? Date.now() - monitor.lastUserTranscriptAtMs
        : null;
    monitor.lastAgentText = text;

    queueMonitorWrite(monitor, {
      kind: "agent",
      channel: "phone",
      level: "info",
      conversationId: monitor.conversationId,
      message: text,
      details: {
        elapsedMs: Date.now() - monitor.startedAtMs,
        replyAfterUserMs,
        tentative: false,
      },
    });
    return;
  }

  if (eventType === "agent_response_correction") {
    const text = normalizeText(
      payload.agent_response_correction_event?.corrected_agent_response
    );
    if (!text || text === monitor.lastAgentText) {
      return;
    }

    queueMonitorWrite(monitor, {
      kind: "agent",
      channel: "phone",
      level: "info",
      conversationId: monitor.conversationId,
      message: text,
      details: {
        elapsedMs: Date.now() - monitor.startedAtMs,
        replyAfterUserMs:
          monitor.lastUserTranscriptAtMs !== null
            ? Date.now() - monitor.lastUserTranscriptAtMs
            : null,
        tentative: false,
        corrected: true,
      },
    });
    monitor.lastAgentText = text;
    return;
  }
}

async function connectMonitor(monitor: ActivePhoneMonitor) {
  if (monitor.stopped) {
    return;
  }

  monitor.attempts += 1;
  const { apiKey } = getServerConfig();
  const socket = new WebSocket(buildMonitorUrl(monitor.conversationId), {
    headers: {
      "xi-api-key": apiKey,
    },
  });
  monitor.socket = socket;

  socket.on("open", () => {
    monitor.opened = true;
    queueMonitorWrite(monitor, {
      kind: "session",
      channel: "phone",
      level: "success",
      conversationId: monitor.conversationId,
      message: "phone realtime monitor connected",
      details: {
        attempt: monitor.attempts,
      },
    });
  });

  socket.on("message", (data) => {
    try {
      const raw = typeof data === "string" ? data : data.toString("utf8");
      const payload = JSON.parse(raw) as MonitorEventPayload;
      handleMonitorEvent(monitor, payload);
    } catch (error) {
      queueMonitorWrite(monitor, {
        kind: "error",
        channel: "phone",
        level: "error",
        conversationId: monitor.conversationId,
        message: `phone realtime monitor parse failed: ${
          error instanceof Error ? error.message : "unknown message"
        }`,
        details: null,
      });
    }
  });

  socket.on("unexpected-response", (request, response) => {
    let body = "";
    response.on("data", (chunk) => {
      if (chunk) {
        body += chunk.toString();
      }
    });
    response.on("end", () => {
      const fatal = response.statusCode === 401 || response.statusCode === 403;
      maybeScheduleRetry(monitor, `unexpected_response_${response.statusCode ?? "unknown"}`, {
        fatal,
        details: {
          statusCode: response.statusCode ?? null,
          statusMessage: response.statusMessage ?? null,
          body: body || null,
        },
      });
    });
    request.destroy();
  });

  socket.on("error", (error) => {
    maybeScheduleRetry(monitor, error.message, {
      fatal: false,
    });
  });

  socket.on("close", (code, reasonBuffer) => {
    const reason = reasonBuffer.toString("utf8");
    const normalClosure = code === 1000;
    const fatal =
      code === 1008 ||
      /not enabled|forbidden|unauthorized/i.test(reason);

    if (monitor.stopped) {
      return;
    }

    if (normalClosure) {
      queueMonitorWrite(monitor, {
        kind: "session",
        channel: "phone",
        level: "success",
        conversationId: monitor.conversationId,
        message: "phone realtime monitor closed",
        details: {
          code,
          reason: reason || null,
        },
      });
      stopMonitor(monitor.conversationId);
      return;
    }

    maybeScheduleRetry(monitor, `close_${code}`, {
      fatal,
      details: {
        code,
        reason: reason || null,
      },
    });
  });
}

export async function startPhoneConversationMonitor(
  conversationId: string
): Promise<MonitorStartResult> {
  const existing = activeMonitors.get(conversationId);
  if (existing && !existing.stopped) {
    return {
      conversationId,
      started: true,
      alreadyActive: true,
    };
  }

  const monitor: ActivePhoneMonitor = {
    conversationId,
    socket: null,
    attempts: 0,
    opened: false,
    stopped: false,
    startedAtMs: Date.now(),
    lastUserTranscriptAtMs: null,
    lastAgentText: null,
    writeChain: Promise.resolve(),
    retryTimer: null,
  };
  activeMonitors.set(conversationId, monitor);

  queueMonitorWrite(monitor, {
    kind: "session",
    channel: "phone",
    level: "info",
    conversationId,
    message: "phone realtime monitor starting",
    details: null,
  });

  void connectMonitor(monitor);

  return {
    conversationId,
    started: true,
    alreadyActive: false,
  };
}

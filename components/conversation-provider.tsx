"use client";

import { useConversation } from "@elevenlabs/react";
import {
  createContext,
  startTransition,
  useContext,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AnalyzeConversationResponse,
  ConversationLifecycleStatus,
  LatencySample,
  TranscriptEntry,
  ConversationTransport,
} from "@/lib/types";

type ConversationContextValue = {
  conversationId: string | null;
  transcript: TranscriptEntry[];
  analysisResult: AnalyzeConversationResponse | null;
  latencySample: LatencySample | null;
  error: string | null;
  isStarting: boolean;
  isAnalyzing: boolean;
  lifecycleStatus: ConversationLifecycleStatus;
  sdkStatus: string;
  startConversation: () => Promise<void>;
  stopConversation: () => Promise<void>;
  clearResult: () => void;
};

type ConversationEvent = {
  source: "user" | "ai";
  message: unknown;
};

type SessionTimingState = {
  startedAtMs: number;
  transport: ConversationTransport;
  connectMs: number | null;
  firstAgentResponseMs: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function extractMessageText(value: unknown): string | null {
  if (typeof value === "string") {
    return value.trim() || null;
  }

  if (!isRecord(value)) {
    return null;
  }

  for (const key of ["message", "text", "agent_response", "user_transcript"]) {
    const candidate = extractMessageText(value[key]);
    if (candidate) {
      return candidate;
    }
  }

  return null;
}

function isConversationEvent(value: unknown): value is ConversationEvent {
  if (!isRecord(value)) {
    return false;
  }

  return (
    (value.source === "user" || value.source === "ai") &&
    extractMessageText(value.message) !== null
  );
}

function isPeerConnectionError(error: unknown): boolean {
  const message =
    error instanceof Error
      ? error.message
      : typeof error === "string"
        ? error
        : "";

  return /pc connection|peer.?connection|rtcpeerconnection/i.test(message);
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [analysisResult, setAnalysisResult] =
    useState<AnalyzeConversationResponse | null>(null);
  const [latencySample, setLatencySample] = useState<LatencySample | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const nextTranscriptId = useRef(0);
  const sessionTiming = useRef<SessionTimingState | null>(null);

  function recordFirstAgentResponse() {
    if (!sessionTiming.current || sessionTiming.current.firstAgentResponseMs !== null) {
      return;
    }

    sessionTiming.current.firstAgentResponseMs = Math.round(
      performance.now() - sessionTiming.current.startedAtMs
    );
  }

  const conversation = useConversation({
    onMessage: (event) => {
      if (!isConversationEvent(event)) {
        return;
      }

      const text = extractMessageText(event.message);
      if (!text) {
        return;
      }

      const role = event.source === "ai" ? "agent" : "user";
      if (role === "agent") {
        recordFirstAgentResponse();
      }
      setTranscript((current) => {
        const last = current[current.length - 1];
        if (last && last.role === role && last.text === text) {
          return current;
        }

        nextTranscriptId.current += 1;
        return [
          ...current,
          {
            id: `line-${nextTranscriptId.current}`,
            role,
            text,
            tentative: false,
            timeInCallSecs: null,
          },
        ];
      });
    },
    onDebug: (event) => {
      if (!isRecord(event)) {
        return;
      }

      const tentativeText =
        event.type === "tentative_agent_response"
          ? extractMessageText(event.response)
          : event.type === "internal_tentative_agent_response" &&
              isRecord(event.tentative_agent_response_internal_event)
            ? extractMessageText(
                event.tentative_agent_response_internal_event.tentative_agent_response
              )
            : null;

      const text = tentativeText;
      if (!text) {
        return;
      }

      recordFirstAgentResponse();
      setTranscript((current) => {
        const last = current[current.length - 1];
        if (last?.role === "agent" && last.tentative) {
          const copy = [...current];
          copy[copy.length - 1] = { ...last, text };
          return copy;
        }

        nextTranscriptId.current += 1;
        return [
          ...current,
          {
            id: `line-${nextTranscriptId.current}`,
            role: "agent",
            text,
            tentative: true,
            timeInCallSecs: null,
          },
        ];
      });
    },
    onConnect: ({ conversationId: connectedConversationId }) => {
      setConversationId(connectedConversationId);
    },
    onError: (event) => {
      const errorValue: unknown = event;
      const message =
        errorValue instanceof Error
          ? errorValue.message
          : typeof errorValue === "string"
            ? errorValue
            : "Conversation failed.";
      setError(message);
    },
  });

  const lifecycleStatus = useMemo<ConversationLifecycleStatus>(() => {
    if (error) {
      return "error";
    }
    if (isAnalyzing) {
      return "analyzing";
    }
    if (conversation.status === "connecting" || isStarting) {
      return "connecting";
    }
    if (conversation.status === "connected") {
      return conversation.isSpeaking ? "speaking" : "listening";
    }
    return "idle";
  }, [conversation.isSpeaking, conversation.status, error, isAnalyzing, isStarting]);

  async function analyzeByConversationId(targetConversationId: string) {
    setIsAnalyzing(true);
    setError(null);
    const analysisStartedAtMs = performance.now();

    try {
      const response = await fetch("/api/eleven/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: targetConversationId }),
      });
      const payload = (await response.json()) as
        | AnalyzeConversationResponse
        | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to analyze conversation."
        );
      }

      startTransition(() => {
        setAnalysisResult(payload as AnalyzeConversationResponse);
      });

      const latencyResponse = await fetch("/api/demo/latency", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          conversationId: targetConversationId,
          channel: "web",
          transport: sessionTiming.current?.transport ?? "unknown",
          connectMs: sessionTiming.current?.connectMs ?? null,
          firstAgentResponseMs: sessionTiming.current?.firstAgentResponseMs ?? null,
          analysisMs: Math.round(performance.now() - analysisStartedAtMs),
          transcript: (payload as AnalyzeConversationResponse).transcript,
        }),
      });

      if (latencyResponse.ok) {
        const latencyPayload = (await latencyResponse.json()) as {
          sample?: LatencySample;
        };
        if (latencyPayload.sample) {
          setLatencySample(latencyPayload.sample);
        }
      }
    } catch (analysisError) {
      setError(
        analysisError instanceof Error
          ? analysisError.message
          : "Failed to analyze conversation."
      );
    } finally {
      setIsAnalyzing(false);
    }
  }

  async function startConversation() {
    setError(null);
    setAnalysisResult(null);
    setLatencySample(null);
    setConversationId(null);
    setTranscript([]);
    nextTranscriptId.current = 0;
    sessionTiming.current = {
      startedAtMs: performance.now(),
      transport: "webrtc",
      connectMs: null,
      firstAgentResponseMs: null,
    };
    setIsStarting(true);

    try {
      await navigator.mediaDevices.getUserMedia({ audio: true });
      try {
        const response = await fetch("/api/eleven/conversation-token", {
          method: "GET",
        });
        const payload = (await response.json()) as
          | { token: string }
          | { error?: string };

        if (!response.ok || !("token" in payload)) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Failed to get conversation token."
          );
        }

        const startedConversationId = await conversation.startSession({
          connectionType: "webrtc",
          conversationToken: payload.token,
        });

        if (sessionTiming.current) {
          sessionTiming.current.connectMs = Math.round(
            performance.now() - sessionTiming.current.startedAtMs
          );
        }
        setConversationId(startedConversationId);
      } catch (webRtcError) {
        if (!isPeerConnectionError(webRtcError)) {
          throw webRtcError;
        }

        if (sessionTiming.current) {
          sessionTiming.current.transport = "websocket";
        }

        const response = await fetch("/api/eleven/signed-url", {
          method: "GET",
        });
        const payload = (await response.json()) as
          | { signedUrl: string }
          | { error?: string };

        if (!response.ok || !("signedUrl" in payload)) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Failed to get signed URL for websocket fallback."
          );
        }

        const startedConversationId = await conversation.startSession({
          connectionType: "websocket",
          signedUrl: payload.signedUrl,
        });

        if (sessionTiming.current) {
          sessionTiming.current.connectMs = Math.round(
            performance.now() - sessionTiming.current.startedAtMs
          );
        }
        setConversationId(startedConversationId);
      }
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Failed to start conversation."
      );
    } finally {
      setIsStarting(false);
    }
  }

  async function stopConversation() {
    const targetConversationId = conversation.getId() ?? conversationId;
    if (!targetConversationId) {
      setError("No conversation ID is available for analysis.");
      return;
    }

    try {
      await conversation.endSession();
      await analyzeByConversationId(targetConversationId);
    } catch (endError) {
      setError(
        endError instanceof Error ? endError.message : "Failed to end conversation."
      );
    }
  }

  function clearResult() {
    setAnalysisResult(null);
    setError(null);
  }

  return (
    <ConversationContext.Provider
      value={{
        conversationId,
        transcript,
        analysisResult,
        latencySample,
        error,
        isStarting,
        isAnalyzing,
        lifecycleStatus,
        sdkStatus: conversation.status,
        startConversation,
        stopConversation,
        clearResult,
      }}
    >
      {children}
    </ConversationContext.Provider>
  );
}

export function useConversationController() {
  const context = useContext(ConversationContext);
  if (!context) {
    throw new Error("useConversationController must be used inside ConversationProvider.");
  }
  return context;
}

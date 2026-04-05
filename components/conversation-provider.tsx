"use client";

import { useConversation } from "@elevenlabs/react";
import {
  createContext,
  startTransition,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";

import type {
  AnalyzeConversationResponse,
  AudioDiagnostics,
  ConversationEventLogEntry,
  ConversationLifecycleStatus,
  ConversationTransport,
  LatencySample,
  TranscriptEntry,
} from "@/lib/types";

const DESIRED_OUTPUT_VOLUME = 1;
const AUDIO_LEVEL_POLL_MS = 320;
const AUDIO_LEVEL_DELTA_THRESHOLD = 0.03;
const LAST_WORKING_TRANSPORT_STORAGE_KEY = "dental-intake:last-working-transport";

type ConversationContextValue = {
  conversationId: string | null;
  transcript: TranscriptEntry[];
  analysisResult: AnalyzeConversationResponse | null;
  latencySample: LatencySample | null;
  sessionEvents: ConversationEventLogEntry[];
  error: string | null;
  isStarting: boolean;
  isAnalyzing: boolean;
  lifecycleStatus: ConversationLifecycleStatus;
  sdkStatus: string;
  audioDiagnostics: AudioDiagnostics;
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

let sharedAudioContext: AudioContext | null = null;

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

function clampVolumeLevel(value: number) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}

function getAudioContextCtor() {
  if (typeof window === "undefined") {
    return null;
  }

  const extendedWindow = window as Window & {
    webkitAudioContext?: typeof AudioContext;
  };

  return window.AudioContext ?? extendedWindow.webkitAudioContext ?? null;
}

async function unlockBrowserAudioPlayback() {
  const AudioContextCtor = getAudioContextCtor();
  if (!AudioContextCtor) {
    return false;
  }

  if (!sharedAudioContext) {
    sharedAudioContext = new AudioContextCtor();
  }

  if (sharedAudioContext.state === "suspended") {
    await sharedAudioContext.resume();
  }

  const oscillator = sharedAudioContext.createOscillator();
  const gain = sharedAudioContext.createGain();
  gain.gain.value = 0.0001;
  oscillator.connect(gain);
  gain.connect(sharedAudioContext.destination);
  oscillator.start();
  oscillator.stop(sharedAudioContext.currentTime + 0.03);

  await new Promise<void>((resolve) => {
    oscillator.addEventListener(
      "ended",
      () => {
        oscillator.disconnect();
        gain.disconnect();
        resolve();
      },
      { once: true }
    );
  });

  return sharedAudioContext.state === "running";
}

function readLastWorkingTransport(): ConversationTransport {
  if (typeof window === "undefined") {
    return "webrtc";
  }

  return window.localStorage.getItem(LAST_WORKING_TRANSPORT_STORAGE_KEY) === "websocket"
    ? "websocket"
    : "webrtc";
}

function persistLastWorkingTransport(transport: ConversationTransport) {
  if (typeof window === "undefined") {
    return;
  }

  if (transport === "webrtc" || transport === "websocket") {
    window.localStorage.setItem(LAST_WORKING_TRANSPORT_STORAGE_KEY, transport);
  }
}

const ConversationContext = createContext<ConversationContextValue | null>(null);

export function ConversationProvider({ children }: { children: ReactNode }) {
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<TranscriptEntry[]>([]);
  const [analysisResult, setAnalysisResult] =
    useState<AnalyzeConversationResponse | null>(null);
  const [latencySample, setLatencySample] = useState<LatencySample | null>(null);
  const [sessionEvents, setSessionEvents] = useState<ConversationEventLogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [activeTransport, setActiveTransport] =
    useState<ConversationTransport>("unknown");
  const [preferredTransport, setPreferredTransport] =
    useState<ConversationTransport>("webrtc");
  const [browserAudioUnlocked, setBrowserAudioUnlocked] = useState(false);
  const [inputLevel, setInputLevel] = useState(0);
  const [outputLevel, setOutputLevel] = useState(0);
  const [receivedAudioEvents, setReceivedAudioEvents] = useState(0);
  const [lastAudioEventAt, setLastAudioEventAt] = useState<string | null>(null);
  const nextTranscriptId = useRef(0);
  const nextSessionEventId = useRef(0);
  const sessionTiming = useRef<SessionTimingState | null>(null);

  const pushSessionEvent = useCallback(
    (label: string, level: ConversationEventLogEntry["level"] = "info") => {
      nextSessionEventId.current += 1;
      setSessionEvents((current) => [
        {
          id: `session-event-${nextSessionEventId.current}`,
          at: new Date().toISOString(),
          label,
          level,
        },
        ...current,
      ]);
    },
    []
  );

  useEffect(() => {
    setPreferredTransport(readLastWorkingTransport());
  }, []);

  function recordFirstAgentResponse() {
    if (!sessionTiming.current || sessionTiming.current.firstAgentResponseMs !== null) {
      return;
    }

    sessionTiming.current.firstAgentResponseMs = Math.round(
      performance.now() - sessionTiming.current.startedAtMs
    );
  }

  const conversation = useConversation({
    volume: DESIRED_OUTPUT_VOLUME,
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
    onAudio: () => {
      setReceivedAudioEvents((current) => current + 1);
      setLastAudioEventAt(new Date().toISOString());
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

      if (!tentativeText) {
        return;
      }

      recordFirstAgentResponse();
      setTranscript((current) => {
        const last = current[current.length - 1];
        if (last?.role === "agent" && last.tentative) {
          const copy = [...current];
          copy[copy.length - 1] = { ...last, text: tentativeText };
          return copy;
        }

        nextTranscriptId.current += 1;
        return [
          ...current,
          {
            id: `line-${nextTranscriptId.current}`,
            role: "agent",
            text: tentativeText,
            tentative: true,
            timeInCallSecs: null,
          },
        ];
      });
    },
    onConnect: ({ conversationId: connectedConversationId }) => {
      if (sessionTiming.current && sessionTiming.current.connectMs === null) {
        sessionTiming.current.connectMs = Math.round(
          performance.now() - sessionTiming.current.startedAtMs
        );
      }
      setConversationId(connectedConversationId);
      pushSessionEvent(`会話に接続しました: ${connectedConversationId}`, "success");
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
      pushSessionEvent(`エラー: ${message}`, "error");
    },
  });

  useEffect(() => {
    if (conversation.status !== "connected") {
      setInputLevel(0);
      setOutputLevel(0);
      return;
    }

    const intervalId = window.setInterval(() => {
      const nextInputLevel = clampVolumeLevel(conversation.getInputVolume());
      const nextOutputLevel = clampVolumeLevel(conversation.getOutputVolume());

      setInputLevel((current) =>
        Math.abs(current - nextInputLevel) >= AUDIO_LEVEL_DELTA_THRESHOLD
          ? nextInputLevel
          : current
      );
      setOutputLevel((current) =>
        Math.abs(current - nextOutputLevel) >= AUDIO_LEVEL_DELTA_THRESHOLD
          ? nextOutputLevel
          : current
      );
    }, AUDIO_LEVEL_POLL_MS);

    return () => {
      window.clearInterval(intervalId);
    };
  }, [conversation, conversation.status]);

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

  const audioDiagnostics = useMemo<AudioDiagnostics>(
    () => ({
      transport: activeTransport,
      requestedVolume: DESIRED_OUTPUT_VOLUME,
      inputLevel,
      outputLevel,
      receivedAudioEvents,
      lastAudioEventAt,
      browserAudioUnlocked,
    }),
    [
      activeTransport,
      browserAudioUnlocked,
      inputLevel,
      lastAudioEventAt,
      outputLevel,
      receivedAudioEvents,
    ]
  );

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
    setSessionEvents([]);
    setInputLevel(0);
    setOutputLevel(0);
    setReceivedAudioEvents(0);
    setLastAudioEventAt(null);
    nextTranscriptId.current = 0;
    nextSessionEventId.current = 0;

    const initialTransport = preferredTransport === "websocket" ? "websocket" : "webrtc";
    sessionTiming.current = {
      startedAtMs: performance.now(),
      transport: initialTransport,
      connectMs: null,
      firstAgentResponseMs: null,
    };
    setActiveTransport(initialTransport);
    setIsStarting(true);
    pushSessionEvent("Web 会話の接続を開始しました。");

    async function getConversationToken() {
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

      return payload.token;
    }

    async function getSignedUrl() {
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

      return payload.signedUrl;
    }

    async function startWithTransport(transport: ConversationTransport) {
      if (transport === "websocket") {
        const signedUrl = await getSignedUrl();
        const startedConversationId = await conversation.startSession({
          connectionType: "websocket",
          signedUrl,
        });
        return { startedConversationId, transport: "websocket" as const };
      }

      const token = await getConversationToken();
      const startedConversationId = await conversation.startSession({
        connectionType: "webrtc",
        conversationToken: token,
      });
      return { startedConversationId, transport: "webrtc" as const };
    }

    try {
      const unlockPromise = unlockBrowserAudioPlayback();
      const microphonePromise = navigator.mediaDevices.getUserMedia({ audio: true });

      const unlocked = await unlockPromise;
      setBrowserAudioUnlocked(unlocked);
      pushSessionEvent(
        unlocked
          ? "ブラウザ音声出力を事前準備しました。"
          : "ブラウザ音声出力の事前準備を環境依存で完了できませんでした。",
        unlocked ? "success" : "warning"
      );

      await microphonePromise;
      pushSessionEvent("マイクへのアクセスを確認しました。", "success");

      try {
        const { startedConversationId, transport } =
          await startWithTransport(initialTransport);

        conversation.setVolume({ volume: DESIRED_OUTPUT_VOLUME });
        persistLastWorkingTransport(transport);
        setPreferredTransport(transport);
        setActiveTransport(transport);
        setConversationId(startedConversationId);
        pushSessionEvent(
          transport === "websocket"
            ? "WebSocket で接続しました。"
            : "WebRTC で接続しました。",
          "success"
        );
      } catch (transportError) {
        if (initialTransport !== "webrtc" || !isPeerConnectionError(transportError)) {
          throw transportError;
        }

        if (sessionTiming.current) {
          sessionTiming.current.transport = "websocket";
        }
        setActiveTransport("websocket");
        pushSessionEvent(
          "WebRTC 接続に失敗したため、WebSocket fallback に切り替えました。",
          "warning"
        );

        const { startedConversationId } = await startWithTransport("websocket");

        conversation.setVolume({ volume: DESIRED_OUTPUT_VOLUME });
        persistLastWorkingTransport("websocket");
        setPreferredTransport("websocket");
        setConversationId(startedConversationId);
        pushSessionEvent("WebSocket fallback で接続しました。", "success");
      }
    } catch (startError) {
      setError(
        startError instanceof Error
          ? startError.message
          : "Failed to start conversation."
      );
      pushSessionEvent(
        startError instanceof Error
          ? `接続開始に失敗しました: ${startError.message}`
          : "接続開始に失敗しました。",
        "error"
      );
    } finally {
      setIsStarting(false);
    }
  }

  async function stopConversation() {
    const targetConversationId = conversation.getId() ?? conversationId;
    if (!targetConversationId) {
      setError("No conversation ID is available for analysis.");
      pushSessionEvent("conversationId が無いため分析できません。", "error");
      return;
    }

    try {
      pushSessionEvent("会話を終了し、分析を開始します。");
      await conversation.endSession();
      await analyzeByConversationId(targetConversationId);
      pushSessionEvent("分析が完了しました。", "success");
    } catch (endError) {
      setError(
        endError instanceof Error ? endError.message : "Failed to end conversation."
      );
      pushSessionEvent(
        endError instanceof Error
          ? `終了または分析に失敗しました: ${endError.message}`
          : "終了または分析に失敗しました。",
        "error"
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
        sessionEvents,
        error,
        isStarting,
        isAnalyzing,
        lifecycleStatus,
        sdkStatus: conversation.status,
        audioDiagnostics,
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

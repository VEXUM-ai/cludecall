"use client";

import Link from "next/link";
import { startTransition, useCallback, useEffect, useMemo, useState } from "react";

import { EMIHA_CLINIC_PROFILE } from "@/lib/clinic-config/emiha";
import {
  EMPTY_VOICE_SCORES,
  getVoiceProviderDescriptors,
} from "@/lib/voice-benchmark/adapters";
import type {
  SubjectiveVoiceScore,
  VoiceBenchmarkRun,
  VoiceConversationScenario,
  VoiceProviderId,
  VoiceReplayResult,
  VoiceScriptCase,
} from "@/lib/types";

import { formatDiff, formatMillis } from "./voice-lab/shared";
import { useElevenSession } from "./voice-lab/use-eleven-session";
import { useGeminiSession } from "./voice-lab/use-gemini-session";

type VoiceLabPageProps = {
  benchmarkEnabled: boolean;
  defaultProvider: string;
  geminiAvailable: boolean;
};

type ScriptPayload = {
  scripts: VoiceScriptCase[];
  scenarios: VoiceConversationScenario[];
};

type ReplayProviderId = Extract<
  VoiceProviderId,
  "eleven_tts_v3" | "gemini_2_5_flash_tts_preview"
>;

type ConversationProviderId = Extract<
  VoiceProviderId,
  "eleven_agents_v3_conversational" | "gemini_3_1_flash_live_preview"
>;

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

function ScoreEditor({
  value,
  onChange,
}: {
  value: SubjectiveVoiceScore;
  onChange: (nextValue: SubjectiveVoiceScore) => void;
}) {
  const fields: Array<{
    key: keyof SubjectiveVoiceScore;
    label: string;
  }> = [
    { key: "naturalness", label: "自然さ" },
    { key: "pronunciation", label: "読み精度" },
    { key: "responsiveness", label: "応答体感" },
    { key: "receptionTone", label: "受付らしさ" },
    { key: "interruptionRecovery", label: "割り込み復帰" },
  ];

  return (
    <div className="score-grid">
      {fields.map((field) => (
        <label key={field.key} className="field-stack">
          <span className="field-label">{field.label}</span>
          <select
            className="text-input"
            value={value[field.key] ?? ""}
            onChange={(event) =>
              onChange({
                ...value,
                [field.key]:
                  event.target.value === "" ? null : Number(event.target.value),
              })
            }
          >
            <option value="">未評価</option>
            {[1, 2, 3, 4, 5].map((score) => (
              <option key={score} value={score}>
                {score}
              </option>
            ))}
          </select>
        </label>
      ))}
    </div>
  );
}

function MetricsCard({
  metrics,
}: {
  metrics: VoiceBenchmarkRun["metrics"];
}) {
  const rows = [
    ["connect_open_ms", formatMillis(metrics.connect_open_ms)],
    ["first_audio_chunk_ms", formatMillis(metrics.first_audio_chunk_ms)],
    ["first_audio_play_ms", formatMillis(metrics.first_audio_play_ms)],
    ["first_reply_after_user_ms", formatMillis(metrics.first_reply_after_user_ms)],
    ["barge_in_recovery_ms", formatMillis(metrics.barge_in_recovery_ms)],
    ["turn_count", `${metrics.turn_count}`],
    ["audio_event_count", `${metrics.audio_event_count}`],
    ["wer_like_diff", formatDiff(metrics.wer_like_diff)],
  ] as const;

  return (
    <section className="card">
      <div className="section-heading">
        <h3>Metrics</h3>
        <p>速度と読み崩れを同じ形で残すための比較メトリクスです。</p>
      </div>
      <dl className="memo-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="memo-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {metrics.expected_text ? (
        <div className="stack-tight compare-block">
          <strong>expected_text</strong>
          <p className="helper-text">{metrics.expected_text}</p>
        </div>
      ) : null}
      {metrics.provider_transcript ? (
        <div className="stack-tight compare-block">
          <strong>provider_transcript</strong>
          <p className="helper-text">{metrics.provider_transcript}</p>
        </div>
      ) : null}
    </section>
  );
}

function TranscriptList({
  transcript,
}: {
  transcript: VoiceBenchmarkRun["transcript"];
}) {
  return (
    <div className="transcript-list" aria-live="polite">
      {transcript.length === 0 ? (
        <p className="placeholder-text">まだ transcript はありません。</p>
      ) : (
        transcript.map((entry) => (
          <article
            key={entry.id}
            className={`transcript-entry ${entry.role === "system" ? "agent" : entry.role}`}
          >
            <header>
              <span>{entry.role}</span>
              <span>{new Date(entry.createdAt).toLocaleTimeString("ja-JP")}</span>
              {entry.tentative ? <em>tentative</em> : null}
            </header>
            <p>{entry.text}</p>
          </article>
        ))
      )}
    </div>
  );
}

function ReplayResultCard({
  providerLabel,
  result,
  score,
  onScoreChange,
  notes,
  onNotesChange,
  onSave,
  isSaving,
}: {
  providerLabel: string;
  result: VoiceReplayResult;
  score: SubjectiveVoiceScore;
  onScoreChange: (nextValue: SubjectiveVoiceScore) => void;
  notes: string;
  onNotesChange: (value: string) => void;
  onSave: () => void;
  isSaving: boolean;
}) {
  const audioSrc = `data:${result.audioMimeType};base64,${result.audioBase64}`;

  return (
    <section className="card stack-tight">
      <div className="section-heading">
        <h3>{providerLabel}</h3>
        <p>{result.title}</p>
      </div>
      <audio className="voice-audio-player" src={audioSrc} controls preload="metadata" />
      <dl className="memo-grid">
        <div className="memo-row">
          <dt>duration</dt>
          <dd>{result.durationMs === null ? "未計測" : `${result.durationMs} ms`}</dd>
        </div>
        <div className="memo-row">
          <dt>wer_like_diff</dt>
          <dd>{formatDiff(result.werLikeDiff)}</dd>
        </div>
      </dl>
      <div className="compare-grid">
        <article className="history-note">
          <header>
            <strong>期待文</strong>
          </header>
          <p>{result.expectedText}</p>
        </article>
        <article className="history-note">
          <header>
            <strong>再文字起こし</strong>
          </header>
          <p>{result.providerTranscript ?? "まだ文字起こし結果はありません。"}</p>
        </article>
      </div>
      <ScoreEditor value={score} onChange={onScoreChange} />
      <label className="field-stack">
        <span className="field-label">メモ</span>
        <textarea
          className="text-input text-area"
          value={notes}
          onChange={(event) => onNotesChange(event.target.value)}
          placeholder="読みの癖、抑揚、違和感など"
        />
      </label>
      <div className="button-row">
        <button
          type="button"
          className="primary-button"
          onClick={onSave}
          disabled={isSaving}
        >
          {isSaving ? "保存中..." : "この結果を保存"}
        </button>
      </div>
    </section>
  );
}

function SavedRunList({ runs }: { runs: VoiceBenchmarkRun[] }) {
  return (
    <section className="card">
      <div className="section-heading">
        <h3>保存済み Run</h3>
        <p>比較ログをこの場で見返せるようにしています。</p>
      </div>
      <div className="history-list">
        {runs.length === 0 ? (
          <p className="placeholder-text">まだ保存済み run はありません。</p>
        ) : (
          runs.map((run) => (
            <details key={run.runId} className="history-note">
              <summary className="summary-row">
                <span>
                  {run.label} / {run.providerId}
                </span>
                <span>{formatDateTime(run.createdAt)}</span>
              </summary>
              <div className="collapsible-body">
                <dl className="memo-grid">
                  <div className="memo-row">
                    <dt>mode</dt>
                    <dd>{run.mode}</dd>
                  </div>
                  <div className="memo-row">
                    <dt>scenarioId</dt>
                    <dd>{run.scenarioId ?? "なし"}</dd>
                  </div>
                  <div className="memo-row">
                    <dt>scriptId</dt>
                    <dd>{run.scriptId ?? "なし"}</dd>
                  </div>
                </dl>
                <MetricsCard metrics={run.metrics} />
                <ScoreEditor value={run.human_scores} onChange={() => undefined} />
                {run.notes ? <p className="helper-text">{run.notes}</p> : null}
                <TranscriptList transcript={run.transcript} />
              </div>
            </details>
          ))
        )}
      </div>
    </section>
  );
}

export function VoiceLabPage({
  benchmarkEnabled,
  defaultProvider,
  geminiAvailable,
}: VoiceLabPageProps) {
  const [catalog, setCatalog] = useState<ScriptPayload>({
    scripts: [],
    scenarios: [],
  });
  const [catalogError, setCatalogError] = useState<string | null>(null);
  const [savedRuns, setSavedRuns] = useState<VoiceBenchmarkRun[]>([]);
  const [savedRunsError, setSavedRunsError] = useState<string | null>(null);
  const [activeMode, setActiveMode] = useState<"conversation" | "tts_replay">(
    "conversation"
  );
  const [selectedScenarioId, setSelectedScenarioId] = useState<string>("");
  const [selectedScriptId, setSelectedScriptId] = useState<string>("");
  const [conversationInput, setConversationInput] = useState("");
  const [conversationNotes, setConversationNotes] = useState("");
  const [conversationScores, setConversationScores] = useState(EMPTY_VOICE_SCORES);
  const [conversationError, setConversationError] = useState<string | null>(null);
  const [conversationSaveState, setConversationSaveState] = useState<string | null>(null);
  const [replayCustomText, setReplayCustomText] = useState("");
  const [replayResults, setReplayResults] = useState<
    Partial<Record<ReplayProviderId, VoiceReplayResult>>
  >({});
  const [replayError, setReplayError] = useState<string | null>(null);
  const [replayStatus, setReplayStatus] = useState<ReplayProviderId | "both" | null>(null);
  const [replaySaveStatus, setReplaySaveStatus] = useState<ReplayProviderId | null>(null);
  const [replaySaveMessage, setReplaySaveMessage] = useState<string | null>(null);
  const [replayNotesByProvider, setReplayNotesByProvider] = useState<
    Record<ReplayProviderId, string>
  >({
    eleven_tts_v3: "",
    gemini_2_5_flash_tts_preview: "",
  });
  const [replayScoresByProvider, setReplayScoresByProvider] = useState<
    Record<ReplayProviderId, SubjectiveVoiceScore>
  >({
    eleven_tts_v3: EMPTY_VOICE_SCORES,
    gemini_2_5_flash_tts_preview: EMPTY_VOICE_SCORES,
  });

  const providerDescriptors = useMemo(
    () => getVoiceProviderDescriptors(geminiAvailable),
    [geminiAvailable]
  );

  const conversationProviders = providerDescriptors.filter(
    (descriptor) => descriptor.lane === "conversation"
  );
  const replayProviders = providerDescriptors.filter(
    (descriptor) => descriptor.lane === "tts_replay"
  );

  const initialConversationProvider = useMemo<ConversationProviderId>(() => {
    const matched = conversationProviders.find(
      (descriptor) => descriptor.providerId === defaultProvider && descriptor.available
    );
    return (matched?.providerId as ConversationProviderId | undefined) ??
      "eleven_agents_v3_conversational";
  }, [conversationProviders, defaultProvider]);

  const [selectedConversationProvider, setSelectedConversationProvider] =
    useState<ConversationProviderId>(initialConversationProvider);

  const elevenSession = useElevenSession();
  const geminiSession = useGeminiSession(geminiAvailable);

  const activeConversationSession =
    selectedConversationProvider === "gemini_3_1_flash_live_preview"
      ? geminiSession
      : elevenSession;

  const selectedScenario = useMemo(
    () =>
      catalog.scenarios.find((scenario) => scenario.id === selectedScenarioId) ?? null,
    [catalog.scenarios, selectedScenarioId]
  );

  const selectedScript = useMemo(
    () => catalog.scripts.find((script) => script.id === selectedScriptId) ?? null,
    [catalog.scripts, selectedScriptId]
  );

  const activeConversationMetrics = useMemo(
    () => ({
      ...activeConversationSession.metrics,
      expected_text:
        activeConversationSession.metrics.expected_text ??
        selectedScenario?.userPrompt ??
        null,
    }),
    [activeConversationSession.metrics, selectedScenario?.userPrompt]
  );

  const loadSavedRuns = useCallback(async () => {
    try {
      const response = await fetch("/api/voice/benchmark/save");
      const payload = (await response.json()) as
        | { items?: VoiceBenchmarkRun[]; error?: string }
        | undefined;
      if (!response.ok || !payload?.items) {
        throw new Error(payload?.error ?? "Failed to load saved runs.");
      }

      startTransition(() => {
        setSavedRuns(payload.items ?? []);
      });
    } catch (loadError) {
      setSavedRunsError(
        loadError instanceof Error ? loadError.message : "Failed to load saved runs."
      );
    }
  }, []);

  useEffect(() => {
    void loadSavedRuns();
  }, [loadSavedRuns]);

  useEffect(() => {
    async function loadCatalog() {
      try {
        const response = await fetch("/api/voice/scripts");
        const payload = (await response.json()) as ScriptPayload & { error?: string };
        if (!response.ok) {
          throw new Error(payload.error ?? "Failed to load voice benchmark scripts.");
        }

        setCatalog(payload);
        if (!selectedScenarioId && payload.scenarios[0]) {
          setSelectedScenarioId(payload.scenarios[0].id);
          setConversationInput(payload.scenarios[0].userPrompt);
        }
        if (!selectedScriptId && payload.scripts[0]) {
          setSelectedScriptId(payload.scripts[0].id);
          setReplayCustomText(payload.scripts[0].expectedText);
        }
      } catch (loadError) {
        setCatalogError(
          loadError instanceof Error
            ? loadError.message
            : "Failed to load voice benchmark scripts."
        );
      }
    }

    void loadCatalog();
  }, [selectedScenarioId, selectedScriptId]);

  useEffect(() => {
    if (selectedScenario) {
      setConversationInput(selectedScenario.userPrompt);
    }
  }, [selectedScenario]);

  useEffect(() => {
    if (selectedScript) {
      setReplayCustomText(selectedScript.expectedText);
    }
  }, [selectedScript]);

  useEffect(() => {
    if (selectedConversationProvider === "gemini_3_1_flash_live_preview") {
      elevenSession.reset();
      return;
    }

    geminiSession.reset();
  }, [elevenSession, geminiSession, selectedConversationProvider]);

  async function saveRun(run: VoiceBenchmarkRun) {
    const response = await fetch("/api/voice/benchmark/save", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(run),
    });
    const payload = (await response.json()) as { run?: VoiceBenchmarkRun; error?: string };
    if (!response.ok || !payload.run) {
      throw new Error(payload.error ?? "Failed to save run.");
    }

    await loadSavedRuns();
    return payload.run;
  }

  async function handleSendConversationPrompt(useScenarioPrompt: boolean) {
    setConversationError(null);
    setConversationSaveState(null);

    const prompt = useScenarioPrompt
      ? (selectedScenario?.userPrompt ?? conversationInput)
      : conversationInput;

    try {
      await activeConversationSession.sendText(prompt);
    } catch (sendError) {
      setConversationError(
        sendError instanceof Error
          ? sendError.message
          : "Failed to send conversation prompt."
      );
    }
  }

  async function handleSaveConversationRun() {
    setConversationError(null);
    setConversationSaveState("保存中...");

    try {
      const providerTranscript =
        (
          activeConversationMetrics.provider_transcript ??
          activeConversationSession.transcript
            .filter((entry) => entry.role === "agent")
            .map((entry) => entry.text)
            .join("\n")
        ) || null;

      await saveRun({
        runId: `voice-run-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        mode: "conversation",
        providerId: activeConversationSession.providerId,
        label: `Conversation / ${
          selectedScenario?.title ?? "custom"
        } / ${activeConversationSession.label}`,
        metrics: {
          ...activeConversationMetrics,
          provider_transcript: providerTranscript,
        },
        transcript: activeConversationSession.transcript,
        human_scores: conversationScores,
        notes: conversationNotes.trim() || null,
        scenarioId: selectedScenario?.id ?? null,
        scriptId: null,
        audioMimeType: null,
        audioBase64: null,
      });
      setConversationSaveState("保存しました。");
    } catch (saveError) {
      setConversationError(
        saveError instanceof Error ? saveError.message : "Failed to save conversation run."
      );
      setConversationSaveState(null);
    }
  }

  async function handleRunReplay(target: ReplayProviderId | "both") {
    if (!selectedScript) {
      setReplayError("スクリプトがまだ読み込まれていません。");
      return;
    }

    setReplayError(null);
    setReplaySaveMessage(null);
    setReplayStatus(target);

    const providers: ReplayProviderId[] =
      target === "both"
        ? ["eleven_tts_v3", "gemini_2_5_flash_tts_preview"]
        : [target];

    try {
      const results = await Promise.all(
        providers.map(async (providerId) => {
          const response = await fetch("/api/voice/replay/run", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              providerId,
              scriptId: selectedScript.id,
              textOverride: replayCustomText.trim() || undefined,
            }),
          });
          const payload = (await response.json()) as VoiceReplayResult & {
            error?: string;
          };
          if (!response.ok) {
            throw new Error(payload.error ?? `Failed to run replay for ${providerId}.`);
          }
          return payload as VoiceReplayResult;
        })
      );

      setReplayResults((current) => {
        const next = { ...current };
        for (const result of results) {
          next[result.providerId as ReplayProviderId] = result;
        }
        return next;
      });
    } catch (runError) {
      setReplayError(
        runError instanceof Error ? runError.message : "Failed to run TTS replay."
      );
    } finally {
      setReplayStatus(null);
    }
  }

  async function handleSaveReplayRun(providerId: ReplayProviderId) {
    const result = replayResults[providerId];
    if (!result) {
      return;
    }

    setReplaySaveStatus(providerId);
    setReplaySaveMessage(null);

    try {
      await saveRun({
        runId: `voice-run-${crypto.randomUUID()}`,
        createdAt: new Date().toISOString(),
        mode: "tts_replay",
        providerId,
        label: `TTS Replay / ${result.title} / ${providerId}`,
        metrics: {
          connect_open_ms: null,
          first_audio_chunk_ms: null,
          first_audio_play_ms: null,
          first_reply_after_user_ms: null,
          barge_in_recovery_ms: null,
          turn_count: 1,
          audio_event_count: 1,
          provider_transcript: result.providerTranscript,
          expected_text: result.expectedText,
          wer_like_diff: result.werLikeDiff,
        },
        transcript: [
          {
            id: `expected-${providerId}`,
            role: "system",
            text: result.expectedText,
            createdAt: new Date().toISOString(),
          },
          ...(result.providerTranscript
            ? [
                {
                  id: `transcript-${providerId}`,
                  role: "agent" as const,
                  text: result.providerTranscript,
                  createdAt: new Date().toISOString(),
                },
              ]
            : []),
        ],
        human_scores: replayScoresByProvider[providerId],
        notes: replayNotesByProvider[providerId].trim() || null,
        scenarioId: null,
        scriptId: result.scriptId,
        audioMimeType: result.audioMimeType,
        audioBase64: result.audioBase64,
      });
      setReplaySaveMessage(`${providerId} を保存しました。`);
    } catch (saveError) {
      setReplayError(
        saveError instanceof Error ? saveError.message : "Failed to save replay run."
      );
    } finally {
      setReplaySaveStatus(null);
    }
  }

  if (!benchmarkEnabled) {
    return (
      <main className="page-shell">
        <section className="card">
          <h1>Voice Lab</h1>
          <p className="lead">
            Voice benchmark is disabled. `.env` に
            `VOICE_BENCHMARK_ENABLED=true` を入れてから使ってください。
          </p>
          <Link href="/" className="ghost-button inline-link-button">
            受付デモへ戻る
          </Link>
        </section>
      </main>
    );
  }

  return (
    <main className="page-shell">
      <section className="hero card">
        <div className="hero-copy">
          <p className="eyebrow">Voice Benchmark Lab</p>
          <h1>Eleven と Gemini を同じ土俵で比較する</h1>
          <p className="lead">
            会話スタック比較と TTS replay を分け、応答速度、日本語の読み、自然さ、
            割り込み復帰を同じ UI から確認できます。
          </p>
          <div className="button-row">
            <button
              type="button"
              className={activeMode === "conversation" ? "primary-button" : "ghost-button"}
              onClick={() => setActiveMode("conversation")}
            >
              Conversation
            </button>
            <button
              type="button"
              className={activeMode === "tts_replay" ? "primary-button" : "ghost-button"}
              onClick={() => setActiveMode("tts_replay")}
            >
              TTS Replay
            </button>
            <Link href="/" className="ghost-button inline-link-button">
              受付デモへ戻る
            </Link>
          </div>
        </div>
        <div className="hero-meta">
          <div>
            <span className="meta-label">医院</span>
            <span>{EMIHA_CLINIC_PROFILE.clinicName}</span>
          </div>
          <div>
            <span className="meta-label">診療時間</span>
            <span>{EMIHA_CLINIC_PROFILE.businessHours}</span>
          </div>
          <div>
            <span className="meta-label">休診日</span>
            <span>{EMIHA_CLINIC_PROFILE.closedDays}</span>
          </div>
        </div>
      </section>

      <section className="layout-grid voice-layout">
        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <h2>Provider</h2>
              <p>Conversation と TTS で比較対象を分けています。</p>
            </div>
            <div className="provider-grid">
              {providerDescriptors.map((descriptor) => (
                <article
                  key={descriptor.providerId}
                  className={`provider-card ${
                    activeMode === descriptor.lane ? "provider-card-active" : ""
                  } ${descriptor.available ? "" : "provider-card-disabled"}`}
                >
                  <div className="history-item-top">
                    <strong>{descriptor.shortLabel}</strong>
                    <span className="drawer-chip">{descriptor.lane}</span>
                  </div>
                  <p className="helper-text">{descriptor.description}</p>
                  {!descriptor.available ? (
                    <p className="warning-text">GEMINI_API_KEY 未設定のため無効です。</p>
                  ) : null}
                </article>
              ))}
            </div>
            {catalogError ? <p className="error-text">{catalogError}</p> : null}
            {savedRunsError ? <p className="error-text">{savedRunsError}</p> : null}
          </section>
          {activeMode === "conversation" ? (
            <>
              <section className="card">
                <div className="section-heading">
                  <h2>Conversation Comparison</h2>
                  <p>
                    v1 は typed turn で同一の入力文を流し、返答音声と transcript を比較します。
                    Eleven は既存 agent、Gemini は Live API です。
                  </p>
                </div>
                <div className="field-stack">
                  <label className="field-label" htmlFor="conversation-provider">
                    Provider
                  </label>
                  <select
                    id="conversation-provider"
                    className="text-input"
                    value={selectedConversationProvider}
                    onChange={(event) =>
                      setSelectedConversationProvider(
                        event.target.value as typeof selectedConversationProvider
                      )
                    }
                  >
                    {conversationProviders.map((descriptor) => (
                      <option
                        key={descriptor.providerId}
                        value={descriptor.providerId}
                        disabled={!descriptor.available}
                      >
                        {descriptor.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="field-stack">
                  <label className="field-label" htmlFor="scenario-select">
                    固定シナリオ
                  </label>
                  <select
                    id="scenario-select"
                    className="text-input"
                    value={selectedScenarioId}
                    onChange={(event) => setSelectedScenarioId(event.target.value)}
                  >
                    {catalog.scenarios.map((scenario) => (
                      <option key={scenario.id} value={scenario.id}>
                        {scenario.title}
                      </option>
                    ))}
                  </select>
                  {selectedScenario ? (
                    <div className="history-note">
                      <header>
                        <strong>比較観点</strong>
                      </header>
                      <p>{selectedScenario.goals.join(" / ")}</p>
                      {selectedScenario.channel || selectedScenario.lineCondition ? (
                        <p className="helper-text">
                          {(selectedScenario.channel ?? "web") === "phone" ? "phone" : "web"} /{" "}
                          {selectedScenario.lineCondition ?? "stable"}
                        </p>
                      ) : null}
                      {selectedScenario.notes ? (
                        <p className="helper-text">{selectedScenario.notes}</p>
                      ) : null}
                      {selectedScenario.mustInclude?.length ? (
                        <p className="helper-text">
                          must_include: {selectedScenario.mustInclude.join(" / ")}
                        </p>
                      ) : null}
                      {selectedScenario.shouldNotSay?.length ? (
                        <p className="helper-text">
                          should_not_say: {selectedScenario.shouldNotSay.join(" / ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="live-status-row">
                  <StatusBadge status={activeConversationSession.status} />
                  <span className="drawer-chip">{activeConversationSession.label}</span>
                </div>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void activeConversationSession.start()}
                    disabled={activeConversationSession.status !== "idle"}
                  >
                    セッション開始
                  </button>
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => void activeConversationSession.stop()}
                    disabled={activeConversationSession.status === "idle"}
                  >
                    セッション終了
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={activeConversationSession.reset}
                  >
                    リセット
                  </button>
                </div>
                <label className="field-stack">
                  <span className="field-label">送信文</span>
                  <textarea
                    className="text-input text-area"
                    value={conversationInput}
                    onChange={(event) => setConversationInput(event.target.value)}
                    placeholder="比較したい発話文を入れる"
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSendConversationPrompt(false)}
                    disabled={activeConversationSession.status === "idle"}
                  >
                    この文を送る
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleSendConversationPrompt(true)}
                    disabled={activeConversationSession.status === "idle" || !selectedScenario}
                  >
                    シナリオ文を送る
                  </button>
                </div>
                {activeConversationSession.error ? (
                  <p className="error-text">{activeConversationSession.error}</p>
                ) : null}
                {conversationError ? <p className="error-text">{conversationError}</p> : null}
                {conversationSaveState ? (
                  <p className="helper-text">{conversationSaveState}</p>
                ) : null}
              </section>

              <TranscriptList transcript={activeConversationSession.transcript} />
              <MetricsCard metrics={activeConversationMetrics} />

              <section className="card">
                <div className="section-heading">
                  <h3>主観評価</h3>
                  <p>同じスコア軸で会話体験を残します。</p>
                </div>
                <ScoreEditor value={conversationScores} onChange={setConversationScores} />
                <label className="field-stack">
                  <span className="field-label">メモ</span>
                  <textarea
                    className="text-input text-area"
                    value={conversationNotes}
                    onChange={(event) => setConversationNotes(event.target.value)}
                    placeholder="発話の自然さ、詰まり、数字読みの癖など"
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleSaveConversationRun()}
                    disabled={activeConversationSession.transcript.length === 0}
                  >
                    会話 run を保存
                  </button>
                </div>
              </section>
            </>
          ) : (
            <>
              <section className="card">
                <div className="section-heading">
                  <h2>TTS Replay</h2>
                  <p>
                    同じ固定文を Eleven v3 と Gemini TTS に流し、再文字起こしと主観評価を比較します。
                  </p>
                </div>
                <div className="field-stack">
                  <label className="field-label" htmlFor="script-select">
                    固定スクリプト
                  </label>
                  <select
                    id="script-select"
                    className="text-input"
                    value={selectedScriptId}
                    onChange={(event) => setSelectedScriptId(event.target.value)}
                  >
                    {catalog.scripts.map((script) => (
                      <option key={script.id} value={script.id}>
                        {script.title}
                      </option>
                    ))}
                  </select>
                  {selectedScript ? (
                    <div className="history-note">
                      {selectedScript.notes ? (
                        <p className="helper-text">{selectedScript.notes}</p>
                      ) : null}
                      {selectedScript.mustContain?.length ? (
                        <p className="helper-text">
                          must_contain: {selectedScript.mustContain.join(" / ")}
                        </p>
                      ) : null}
                      {selectedScript.shouldNotContain?.length ? (
                        <p className="helper-text">
                          should_not_contain: {selectedScript.shouldNotContain.join(" / ")}
                        </p>
                      ) : null}
                      {selectedScript.keyterms?.length ? (
                        <p className="helper-text">
                          keyterms: {selectedScript.keyterms.join(" / ")}
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <label className="field-stack">
                  <span className="field-label">再生テキスト</span>
                  <textarea
                    className="text-input text-area"
                    value={replayCustomText}
                    onChange={(event) => setReplayCustomText(event.target.value)}
                  />
                </label>
                <div className="button-row">
                  <button
                    type="button"
                    className="primary-button"
                    onClick={() => void handleRunReplay("both")}
                    disabled={replayStatus !== null}
                  >
                    {replayStatus === "both" ? "生成中..." : "両方生成"}
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleRunReplay("eleven_tts_v3")}
                    disabled={replayStatus !== null}
                  >
                    Eleven だけ
                  </button>
                  <button
                    type="button"
                    className="ghost-button"
                    onClick={() => void handleRunReplay("gemini_2_5_flash_tts_preview")}
                    disabled={replayStatus !== null || !geminiAvailable}
                  >
                    Gemini だけ
                  </button>
                </div>
                {replayError ? <p className="error-text">{replayError}</p> : null}
                {replaySaveMessage ? <p className="helper-text">{replaySaveMessage}</p> : null}
              </section>

              <div className="provider-grid replay-grid">
                {replayProviders.map((descriptor) => {
                  const providerId = descriptor.providerId as ReplayProviderId;
                  const result = replayResults[providerId];
                  if (!result) {
                    return (
                      <section key={providerId} className="card">
                        <div className="section-heading">
                          <h3>{descriptor.label}</h3>
                          <p>{descriptor.description}</p>
                        </div>
                        <p className="placeholder-text">まだ生成していません。</p>
                      </section>
                    );
                  }

                  return (
                    <ReplayResultCard
                      key={providerId}
                      providerLabel={descriptor.label}
                      result={result}
                      score={replayScoresByProvider[providerId]}
                      onScoreChange={(nextValue) =>
                        setReplayScoresByProvider((current) => ({
                          ...current,
                          [providerId]: nextValue,
                        }))
                      }
                      notes={replayNotesByProvider[providerId]}
                      onNotesChange={(value) =>
                        setReplayNotesByProvider((current) => ({
                          ...current,
                          [providerId]: value,
                        }))
                      }
                      onSave={() => void handleSaveReplayRun(providerId)}
                      isSaving={replaySaveStatus === providerId}
                    />
                  );
                })}
              </div>
            </>
          )}
        </div>

        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <h2>比較メモ</h2>
              <p>このラボで固定している前提です。</p>
            </div>
            <ol className="ordered-list">
              <li>会話比較は typed turn を使い、入力文を揃えます。</li>
              <li>Eleven Agents と Eleven v3 は別トラックとして扱います。</li>
              <li>Gemini Live は browser から direct 接続し、電話品質は混ぜません。</li>
              <li>受付デモ本体は `/` に残し、この画面は比較専用です。</li>
            </ol>
          </section>

          <SavedRunList runs={savedRuns} />
        </div>
      </section>
    </main>
  );
}

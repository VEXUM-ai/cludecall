"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

import { useConversationController } from "@/components/conversation-provider";
import type {
  ConversationEventLogEntry,
  ConversationHistoryDetail,
  ConversationHistorySummary,
  DemoRun,
  LatencySample,
  OutboundCallResult,
  TranscriptEntry,
} from "@/lib/types";

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

function formatBoolean(value: boolean | null) {
  if (value === null) {
    return "未取得";
  }

  return value ? "はい" : "いいえ";
}

function formatOptional(value: string | number | null) {
  if (value === null || value === "") {
    return "未取得";
  }

  return String(value);
}

function formatNumber(value: number | null) {
  if (value === null || Number.isNaN(value)) {
    return "未取得";
  }

  return `${value}`;
}

function formatMillis(value: number | null) {
  if (value === null) {
    return "未取得";
  }

  return `${value} ms`;
}

function formatPercent(value: number) {
  return `${Math.round(value * 100)}%`;
}

function formatTimeInCall(value: number | null) {
  if (value === null) {
    return "時刻なし";
  }

  return `${value} sec`;
}

function formatDateTime(value: string | null) {
  if (!value) {
    return "未取得";
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("ja-JP", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

function summarizeSource(source: string | null, channel: string) {
  if (source === "twilio") {
    return "Twilio";
  }

  if (source === "react_sdk") {
    return "Web";
  }

  if (source) {
    return source;
  }

  return channel;
}

function MemoTable({
  title,
  memo,
}: {
  title: string;
  memo: DemoRun["memo"];
}) {
  const rows = [
    ["患者名", memo.patient_name],
    ["電話番号", memo.phone_number],
    ["新患かどうか", formatBoolean(memo.is_new_patient)],
    ["来院理由", memo.visit_reason],
    ["第1希望日", memo.preferred_date_1],
    ["第1希望時間帯", memo.preferred_time_range_1],
    ["第2希望日", memo.preferred_date_2],
    ["第2希望時間帯", memo.preferred_time_range_2],
    ["折り返し可否", formatBoolean(memo.callback_ok)],
    ["未解決事項", memo.unresolved_questions],
    ["スタッフ向けメモ", memo.notes_for_staff],
    ["受付ステータス", memo.booking_status],
  ] as const;

  return (
    <section className="card">
      <div className="section-heading">
        <h3>{title}</h3>
      </div>
      <dl className="memo-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="memo-row">
            <dt>{label}</dt>
            <dd>{formatOptional(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function LatencyTable({
  title,
  sample,
}: {
  title: string;
  sample: LatencySample | null;
}) {
  if (!sample) {
    return null;
  }

  const rows = [
    ["transport", sample.transport],
    ["connect_ms", sample.connectMs],
    ["first_agent_response_ms", sample.firstAgentResponseMs],
    ["first_reply_after_user_ms", sample.firstAgentReplyAfterUserMs],
    ["average_reply_after_user_ms", sample.averageAgentReplyAfterUserMs],
    ["analysis_ms", sample.analysisMs],
    ["measured_turns", sample.measuredTurns],
  ] as const;

  return (
    <section className="card">
      <div className="section-heading">
        <h3>{title}</h3>
      </div>
      <dl className="memo-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="memo-row">
            <dt>{label}</dt>
            <dd>{formatOptional(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

function EvaluationTable({
  title,
  evaluation,
}: {
  title: string;
  evaluation: DemoRun["analysis"]["evaluationCriteriaResults"];
}) {
  return (
    <section className="card">
      <div className="section-heading">
        <h3>{title}</h3>
      </div>
      <div className="stack-tight">
        {evaluation.length === 0 ? (
          <p className="placeholder-text">評価結果はまだありません。</p>
        ) : (
          evaluation.map((criterion) => (
            <article key={criterion.criteriaId} className="history-note">
              <header>
                <strong>{criterion.criteriaId}</strong>
                <StatusBadge status={criterion.result ?? "unknown"} />
              </header>
              <p>{criterion.rationale ?? "未取得"}</p>
            </article>
          ))
        )}
      </div>
    </section>
  );
}

function TranscriptCard({
  title,
  subtitle,
  transcript,
  emptyText,
}: {
  title: string;
  subtitle: string;
  transcript: TranscriptEntry[];
  emptyText: string;
}) {
  return (
    <section className="card transcript-card">
      <div className="section-heading">
        <h2>{title}</h2>
        <p>{subtitle}</p>
      </div>
      {transcript.length === 0 ? (
        <p className="placeholder-text">{emptyText}</p>
      ) : (
        <div className="transcript-list" aria-live="polite">
          {transcript.map((entry) => (
            <article key={entry.id} className={`transcript-entry ${entry.role}`}>
              <header>
                <span>{entry.role === "user" ? "User" : "Agent"}</span>
                <span>{formatTimeInCall(entry.timeInCallSecs)}</span>
                {entry.tentative ? <em>tentative</em> : null}
              </header>
              <p>{entry.text}</p>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function SessionEventList({
  events,
}: {
  events: ConversationEventLogEntry[];
}) {
  return (
    <section className="card">
      <div className="section-heading">
        <h2>現在のアクションログ</h2>
        <p>接続開始、fallback、解析開始、解析完了などの内部イベントを表示します。</p>
      </div>
      {events.length === 0 ? (
        <p className="placeholder-text">まだセッションイベントはありません。</p>
      ) : (
        <div className="stack-tight">
          {events.map((event) => (
            <article key={event.id} className={`history-note event-${event.level}`}>
              <header>
                <strong>{event.label}</strong>
                <span>{formatDateTime(event.at)}</span>
              </header>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ConversationSummaryCard({
  item,
  selected,
  onSelect,
}: {
  item: ConversationHistorySummary;
  selected: boolean;
  onSelect: (conversationId: string) => void;
}) {
  return (
    <button
      type="button"
      className={`history-item ${selected ? "selected" : ""}`}
      onClick={() => onSelect(item.conversationId)}
    >
      <div className="history-item-top">
        <span className="history-title">
          {item.analysisTitle ?? item.conversationId.slice(0, 12)}
        </span>
        <StatusBadge status={item.status ?? "unknown"} />
      </div>
      <div className="history-item-meta">
        <span>{summarizeSource(item.source, item.channel)}</span>
        <span>{formatOptional(item.durationSecs)} sec</span>
        <span>{item.success ?? "未取得"}</span>
      </div>
      <p className="history-item-summary">
        {item.transcriptSummary ?? "要約はまだありません。"}
      </p>
    </button>
  );
}

function DetailMeta({
  detail,
}: {
  detail: ConversationHistoryDetail;
}) {
  const rows = [
    ["conversation_id", detail.conversationId],
    ["channel", detail.channel],
    ["source", detail.source],
    ["status", detail.status],
    ["startedAt", formatDateTime(detail.callMeta.startedAt)],
    ["durationSecs", formatNumber(detail.callMeta.durationSecs)],
    ["maskedCaller", detail.callMeta.maskedCaller],
    ["agentNumber", detail.callMeta.agentNumber],
    ["direction", detail.callMeta.direction],
    ["cost", detail.cost === null ? null : `${detail.cost}`],
    ["latency.recordedAt", detail.latency?.recordedAt ?? null],
    ["latency.connectMs", detail.latency ? formatMillis(detail.latency.connectMs) : null],
    [
      "latency.firstAgentResponseMs",
      detail.latency ? formatMillis(detail.latency.firstAgentResponseMs) : null,
    ],
    [
      "latency.averageReplyAfterUserMs",
      detail.latency ? formatMillis(detail.latency.averageAgentReplyAfterUserMs) : null,
    ],
    ["latency.measuredTurns", detail.latency ? detail.latency.measuredTurns : null],
  ] as const;

  return (
    <section className="card">
      <div className="section-heading">
        <h3>選択中の会話メタデータ</h3>
      </div>
      <dl className="memo-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="memo-row">
            <dt>{label}</dt>
            <dd>{formatOptional(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

export function HomePage({
  defaultOutboundNumber,
}: {
  defaultOutboundNumber: string;
}) {
  const {
    conversationId,
    transcript,
    analysisResult,
    latencySample,
    sessionEvents,
    error,
    isStarting,
    isAnalyzing,
    lifecycleStatus,
    sdkStatus,
    audioDiagnostics,
    startConversation,
    stopConversation,
    clearResult,
  } = useConversationController();

  const [historyItems, setHistoryItems] = useState<ConversationHistorySummary[]>([]);
  const [selectedHistoryId, setSelectedHistoryId] = useState<string | null>(null);
  const [selectedHistoryDetail, setSelectedHistoryDetail] =
    useState<ConversationHistoryDetail | null>(null);
  const [isLoadingHistory, setIsLoadingHistory] = useState(false);
  const [isLoadingHistoryDetail, setIsLoadingHistoryDetail] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [outboundNumber, setOutboundNumber] = useState(defaultOutboundNumber);
  const [isPlacingCall, setIsPlacingCall] = useState(false);
  const [outboundCallError, setOutboundCallError] = useState<string | null>(null);
  const [outboundCallResult, setOutboundCallResult] = useState<OutboundCallResult | null>(
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportingPhoneCall, setIsImportingPhoneCall] = useState(false);

  const canStart = lifecycleStatus === "idle" || lifecycleStatus === "error";
  const canStop =
    lifecycleStatus === "connecting" ||
    lifecycleStatus === "listening" ||
    lifecycleStatus === "speaking";

  const selectedSummary = useMemo(
    () => historyItems.find((item) => item.conversationId === selectedHistoryId) ?? null,
    [historyItems, selectedHistoryId]
  );

  const liveTranscriptPlaceholder = useMemo(() => {
    if (canStop) {
      return "会話中です。発話ごとの transcript をここに表示します。";
    }
    return "開始すると transcript を表示します。";
  }, [canStop]);

  const selectedTranscript = selectedHistoryDetail?.transcript ?? [];

  const loadHistoryDetail = useCallback(async (conversationIdToLoad: string) => {
    setDetailError(null);
    setIsLoadingHistoryDetail(true);

    try {
      const response = await fetch(`/api/demo/conversations/${conversationIdToLoad}`);
      const payload = (await response.json()) as ConversationHistoryDetail | { error?: string };

      if (!response.ok) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to load conversation details."
        );
      }

      setSelectedHistoryDetail(payload as ConversationHistoryDetail);
      setSelectedHistoryId(conversationIdToLoad);
    } catch (loadError) {
      setDetailError(
        loadError instanceof Error ? loadError.message : "Failed to load conversation details."
      );
    } finally {
      setIsLoadingHistoryDetail(false);
    }
  }, []);

  const refreshHistory = useCallback(
    async (preferredConversationId?: string | null) => {
      setHistoryError(null);
      setIsLoadingHistory(true);

      try {
        const response = await fetch("/api/demo/conversations?limit=8");
        const payload = (await response.json()) as
          | { items: ConversationHistorySummary[]; count: number }
          | { error?: string };

        if (!response.ok || !("items" in payload)) {
          throw new Error(
            "error" in payload && typeof payload.error === "string"
              ? payload.error
              : "Failed to load conversation history."
          );
        }

        setHistoryItems(payload.items);

        const nextSelectedId =
          preferredConversationId ??
          selectedHistoryId ??
          payload.items[0]?.conversationId ??
          null;

        if (
          nextSelectedId &&
          payload.items.some((item) => item.conversationId === nextSelectedId)
        ) {
          if (nextSelectedId !== selectedHistoryId) {
            await loadHistoryDetail(nextSelectedId);
          }
        } else if (payload.items[0]) {
          await loadHistoryDetail(payload.items[0].conversationId);
        } else {
          setSelectedHistoryId(null);
          setSelectedHistoryDetail(null);
        }
      } catch (loadError) {
        setHistoryError(
          loadError instanceof Error ? loadError.message : "Failed to load conversation history."
        );
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [loadHistoryDetail, selectedHistoryId]
  );

  useEffect(() => {
    if (typeof window === "undefined") {
      void refreshHistory();
      return;
    }

    const supportsIdleCallback =
      typeof window.requestIdleCallback === "function" &&
      typeof window.cancelIdleCallback === "function";
    const scheduleRefresh = supportsIdleCallback
      ? window.requestIdleCallback(() => {
          void refreshHistory();
        })
      : window.setTimeout(() => {
          void refreshHistory();
        }, 1200);

    return () => {
      if (supportsIdleCallback) {
        window.cancelIdleCallback(scheduleRefresh);
        return;
      }

      window.clearTimeout(scheduleRefresh);
    };
  }, [refreshHistory]);

  useEffect(() => {
    if (analysisResult?.conversationId) {
      void refreshHistory(analysisResult.conversationId);
    }
  }, [analysisResult?.conversationId, refreshHistory]);

  async function handleImportLatestPhoneCall() {
    setImportError(null);
    setIsImportingPhoneCall(true);

    try {
      const response = await fetch("/api/demo/import-last-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const payload = (await response.json()) as DemoRun | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to import the latest phone call."
        );
      }

      const imported = payload as DemoRun;
      setSelectedHistoryDetail({
        ...imported,
        source: "twilio",
        status: "done",
      });
      setSelectedHistoryId(imported.conversationId);
      void refreshHistory(imported.conversationId);
    } catch (importingError) {
      setImportError(
        importingError instanceof Error
          ? importingError.message
          : "Failed to import the latest phone call."
      );
    } finally {
      setIsImportingPhoneCall(false);
    }
  }

  async function handlePlaceOutboundCall() {
    setOutboundCallError(null);
    setOutboundCallResult(null);
    setIsPlacingCall(true);

    try {
      const response = await fetch("/api/demo/outbound-call", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ toNumber: outboundNumber }),
      });
      const payload = (await response.json()) as OutboundCallResult | { error?: string };
      if (!response.ok) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to place the outbound call."
        );
      }
      setOutboundCallResult(payload as OutboundCallResult);
      void refreshHistory();
    } catch (callError) {
      setOutboundCallError(
        callError instanceof Error ? callError.message : "Failed to place the outbound call."
      );
    } finally {
      setIsPlacingCall(false);
    }
  }

  async function handleSelectHistoryConversation(conversationIdToLoad: string) {
    await loadHistoryDetail(conversationIdToLoad);
  }

  const liveMetricsRows = [
    ["状態", <StatusBadge key="status" status={lifecycleStatus} />],
    ["SDK", <span key="sdk">{sdkStatus}</span>],
    ["conversationId", <code key="conversation">{conversationId ?? "未開始"}</code>],
    ["transport", <span key="transport">{audioDiagnostics.transport}</span>],
    ["audio packets", <span key="audio">{audioDiagnostics.receivedAudioEvents}</span>],
    [
      "first response",
      <span key="first-response">{formatMillis(analysisResult ? latencySample?.firstAgentResponseMs ?? null : null)}</span>,
    ],
    [
      "analysis latency",
      <span key="analysis">{formatMillis(latencySample?.analysisMs ?? null)}</span>,
    ],
    [
      "live input level",
      <span key="input">{formatPercent(audioDiagnostics.inputLevel)}</span>,
    ],
    [
      "live output level",
      <span key="output">{formatPercent(audioDiagnostics.outputLevel)}</span>,
    ],
    [
      "last audio packet",
      <span key="last">{formatOptional(audioDiagnostics.lastAudioEventAt)}</span>,
    ],
  ] as const;

  return (
    <main className="page-shell">
      <section className="hero card">
        <div className="hero-copy">
          <p className="eyebrow">Dental Receptionist Demo</p>
          <h1>歯科一次受付 AI デモ</h1>
          <p className="lead">
            Web 会話、実電話、過去会話の transcript、要約、遅延、評価結果を同じ画面で見られるデモです。
          </p>
        </div>
        <div className="hero-meta">
          <div>
            <span className="meta-label">状態</span>
            <StatusBadge status={lifecycleStatus} />
          </div>
          <div>
            <span className="meta-label">SDK</span>
            <span>{sdkStatus}</span>
          </div>
          <div>
            <span className="meta-label">conversationId</span>
            <code>{conversationId ?? "未開始"}</code>
          </div>
        </div>
      </section>

      <section className="layout-grid">
        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <h2>Web 会話</h2>
              <p>ブラウザから agent に接続して会話し、終了後にメモを取得します。</p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={startConversation}
                disabled={!canStart || isStarting || isAnalyzing}
              >
                {isStarting ? "接続中..." : "開始"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={stopConversation}
                disabled={!canStop || isStarting || isAnalyzing}
              >
                {isAnalyzing ? "解析中..." : "終了してメモ取得"}
              </button>
              <button
                type="button"
                className="ghost-button"
                onClick={clearResult}
                disabled={!analysisResult && !error}
              >
                クリア
              </button>
            </div>
            {error ? <p className="error-text">{error}</p> : null}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>実行メタデータ</h2>
              <p>現在の会話状態、音声レベル、解析遅延をまとめて確認できます。</p>
            </div>
            <dl className="meta-grid diagnostics-grid">
              {liveMetricsRows.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <TranscriptCard
            title="ライブ transcript"
            subtitle="現在の Web 会話の発話を逐次表示します。"
            transcript={transcript}
            emptyText={liveTranscriptPlaceholder}
          />

          <SessionEventList events={sessionEvents} />

          {analysisResult ? (
            <>
              <MemoTable title="Web 会話の受付メモ" memo={analysisResult.memo} />
              <LatencyTable title="Web 会話のレイテンシ" sample={latencySample} />
            </>
          ) : null}
        </div>

        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <h2>最近の会話履歴</h2>
              <p>
                Web と電話の過去会話を一覧表示し、選択すると transcript、要約、メタデータを見られます。
              </p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="ghost-button"
                onClick={() => void refreshHistory(selectedHistoryId)}
                disabled={isLoadingHistory}
              >
                {isLoadingHistory ? "更新中..." : "履歴を更新"}
              </button>
            </div>
            {historyError ? <p className="error-text">{historyError}</p> : null}
            <div className="history-list">
              {historyItems.length === 0 ? (
                <p className="placeholder-text">まだ表示できる会話履歴がありません。</p>
              ) : (
                historyItems.map((item) => (
                  <ConversationSummaryCard
                    key={item.conversationId}
                    item={item}
                    selected={item.conversationId === selectedHistoryId}
                    onSelect={(id) => void handleSelectHistoryConversation(id)}
                  />
                ))
              )}
            </div>
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>選択中の会話詳細</h2>
              <p>
                履歴から選ぶか、最新の電話会話を取り込むと transcript と分析結果をここに表示します。
              </p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={handleImportLatestPhoneCall}
                disabled={isImportingPhoneCall}
              >
                {isImportingPhoneCall ? "取り込み中..." : "最新の電話会話を取り込む"}
              </button>
            </div>
            {importError ? <p className="error-text">{importError}</p> : null}
            {selectedSummary ? (
              <div className="selected-summary">
                <div>
                  <span className="meta-label">選択中</span>
                  <h3>{selectedSummary.analysisTitle ?? selectedSummary.conversationId}</h3>
                </div>
                <p>{selectedSummary.transcriptSummary ?? "要約は未取得です。"}</p>
              </div>
            ) : null}
            {detailError ? <p className="error-text">{detailError}</p> : null}
            {isLoadingHistoryDetail ? (
              <p className="placeholder-text">詳細を読み込み中です。</p>
            ) : selectedHistoryDetail ? (
              <div className="stack">
                <DetailMeta detail={selectedHistoryDetail} />
                <MemoTable title="選択中の受付メモ" memo={selectedHistoryDetail.memo} />
                <LatencyTable title="選択中のレイテンシ" sample={selectedHistoryDetail.latency} />
                <EvaluationTable
                  title="選択中の評価結果"
                  evaluation={selectedHistoryDetail.analysis.evaluationCriteriaResults}
                />
                <TranscriptCard
                  title="選択中の transcript"
                  subtitle="Web か電話の過去会話をそのまま再表示します。"
                  transcript={selectedTranscript}
                  emptyText="この会話の transcript はまだありません。"
                />
              </div>
            ) : (
              <p className="placeholder-text">会話履歴を選ぶと詳細が表示されます。</p>
            )}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>AI から電話をかける</h2>
              <p>
                アプリから ElevenLabs の outbound call API を呼び出して、指定番号へ電話をかけます。
              </p>
            </div>
            <div className="field-stack">
              <label className="field-label" htmlFor="outbound-number">
                発信先番号
              </label>
              <input
                id="outbound-number"
                className="text-input"
                type="tel"
                value={outboundNumber}
                onChange={(event) => setOutboundNumber(event.target.value)}
                placeholder="+819012345678"
              />
              <p className="helper-text">
                E.164 形式です。通常は `.env` の番号が初期表示されます。
              </p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={handlePlaceOutboundCall}
                disabled={isPlacingCall || outboundNumber.trim().length === 0}
              >
                {isPlacingCall ? "発信中..." : "AI から電話をかける"}
              </button>
            </div>
            {outboundCallError ? <p className="error-text">{outboundCallError}</p> : null}
            {outboundCallResult ? (
              <dl className="meta-grid">
                <div>
                  <dt>message</dt>
                  <dd>{outboundCallResult.message}</dd>
                </div>
                <div>
                  <dt>conversation_id</dt>
                  <dd>{formatOptional(outboundCallResult.conversationId)}</dd>
                </div>
                <div>
                  <dt>callSid</dt>
                  <dd>{formatOptional(outboundCallResult.callSid)}</dd>
                </div>
                <div>
                  <dt>agent phone</dt>
                  <dd>{formatOptional(outboundCallResult.agentPhoneNumber)}</dd>
                </div>
              </dl>
            ) : null}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>即日デモ手順</h2>
              <p>
                Twilio の Verified Caller ID を使った outbound-only の電話デモを前提にしています。
              </p>
            </div>
            <ol className="ordered-list">
              <li>`.env` を設定して `npm run agent:apply-demo-config` で prompt を反映する。</li>
              <li>この画面の `AI から電話をかける` から発信する。</li>
              <li>電話で予約会話を行う。</li>
              <li>通話後に `最新の電話会話を取り込む` を実行する。</li>
              <li>`npm run demo:import-last-call` で Markdown 記録も保存する。</li>
            </ol>
          </section>
        </div>
      </section>
    </main>
  );
}

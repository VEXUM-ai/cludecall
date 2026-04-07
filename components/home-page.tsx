"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";

import { useConversationController } from "@/components/conversation-provider";
import { EMIHA_CLINIC_PROFILE } from "@/lib/clinic-config/emiha";
import {
  findBookingRule,
  LINE_FORM_STATUS_LABELS,
  SERVICE_LINE_LABELS,
  SUBMISSION_STATE_LABELS,
  TRIAGE_LEVEL_LABELS,
} from "@/lib/appointments";
import type {
  AppointmentDraft,
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

function formatServiceLine(value: DemoRun["memo"]["service_line"]) {
  if (!value) {
    return "未取得";
  }

  return SERVICE_LINE_LABELS[value];
}

function formatTriageLevel(value: DemoRun["memo"]["triage_level"]) {
  if (!value) {
    return "未取得";
  }

  return TRIAGE_LEVEL_LABELS[value];
}

function formatLineFormStatus(value: DemoRun["memo"]["line_form_status"]) {
  if (!value) {
    return "未取得";
  }

  return LINE_FORM_STATUS_LABELS[value];
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
    ["受付区分", formatServiceLine(memo.service_line)],
    ["優先度", formatTriageLevel(memo.triage_level)],
    ["LINE問診", formatLineFormStatus(memo.line_form_status)],
    ["人確認理由", memo.manual_review_reason],
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

function ClinicProfileCard() {
  const facts = [
    ["医院", EMIHA_CLINIC_PROFILE.clinicName],
    ["電話", EMIHA_CLINIC_PROFILE.phoneNumber],
    ["診療", EMIHA_CLINIC_PROFILE.businessHours],
    ["休診", EMIHA_CLINIC_PROFILE.closedDays],
    ["アクセス", EMIHA_CLINIC_PROFILE.nearestStation],
    ["急患", EMIHA_CLINIC_PROFILE.emergencyPolicy],
  ] as const;

  return (
    <section className="card">
      <div className="section-heading">
        <h2>医院情報</h2>
        <p>患者向けに案内する公開情報です。</p>
      </div>
      <div className="fact-grid">
        {facts.map(([label, value]) => (
          <div key={label} className="fact-tile">
            <span className="fact-label">{label}</span>
            <strong>{value}</strong>
          </div>
        ))}
      </div>
      <p className="helper-text clinic-footnote">
        {EMIHA_CLINIC_PROFILE.address} / {EMIHA_CLINIC_PROFILE.parking}
      </p>
    </section>
  );
}

function AppointmentDraftCard({
  title,
  draft,
  onConfirm,
  isConfirming,
  error,
}: {
  title: string;
  draft: AppointmentDraft | null;
  onConfirm: (() => void) | null;
  isConfirming: boolean;
  error: string | null;
}) {
  if (!draft) {
    return null;
  }

  const rule = findBookingRule(draft.serviceLine);
  const rows = [
    ["受付区分", SERVICE_LINE_LABELS[draft.serviceLine]],
    ["優先度", TRIAGE_LEVEL_LABELS[draft.triageLevel]],
    ["LINE問診", LINE_FORM_STATUS_LABELS[draft.lineFormStatus]],
    ["提出モード", draft.submissionMode],
    ["提出状態", SUBMISSION_STATE_LABELS[draft.submissionState]],
    ["人確認理由", draft.manualReviewReason ?? "なし"],
    ["引き継ぎ要約", draft.handoffSummary],
  ] as const;

  return (
    <section className="card">
      <div className="section-heading">
        <h3>{title}</h3>
        <p>アポツール投入前の正規化済みドラフトです。今回のデモでは人確認後に手動登録します。</p>
      </div>
      <dl className="memo-grid">
        {rows.map(([label, value]) => (
          <div key={label} className="memo-row">
            <dt>{label}</dt>
            <dd>{value}</dd>
          </div>
        ))}
      </dl>
      {draft.preferredSlots.length > 0 ? (
        <div className="stack-tight appointment-section">
          <strong>希望枠</strong>
          {draft.preferredSlots.map((slot) => (
            <div key={slot.label} className="history-note">
              <header>
                <strong>{slot.label}</strong>
                <span>{formatOptional(slot.date)}</span>
              </header>
              <p>{formatOptional(slot.timeRange)}</p>
            </div>
          ))}
        </div>
      ) : null}
      {rule ? (
        <div className="stack-tight appointment-section">
          <strong>予約ルール</strong>
          <article className="history-note">
            <header>
              <strong>{rule.label}</strong>
              <span>{rule.chairFootprint}</span>
            </header>
            <p>{rule.staffing}</p>
            <p>{rule.patientFacingNotes.join(" ")}</p>
          </article>
        </div>
      ) : null}
      <div className="button-row appointment-actions">
        <button
          type="button"
          className="primary-button"
          onClick={onConfirm ?? undefined}
          disabled={!onConfirm || isConfirming || draft.submissionState !== "drafted"}
        >
          {isConfirming ? "確認中..." : "確認してアポ登録"}
        </button>
      </div>
      {error ? <p className="error-text">{error}</p> : null}
      <div className="stack-tight appointment-section">
        <strong>アポツール投入用 payload</strong>
        <pre className="payload-block">
          {JSON.stringify(draft.appointmentToolPayload, null, 2)}
        </pre>
      </div>
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
    <div className="stack-tight">
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
    </div>
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
        {item.appointmentDraft ? (
          <span>{SUBMISSION_STATE_LABELS[item.appointmentDraft.submissionState]}</span>
        ) : null}
      </div>
      <p className="history-item-summary">
        {item.transcriptSummary ?? "要約はまだありません。"}
      </p>
      <span className="history-link">詳細を見る</span>
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

function HistoryDetailDrawer({
  open,
  detail,
  summary,
  onClose,
  onConfirm,
  isConfirming,
  error,
}: {
  open: boolean;
  detail: ConversationHistoryDetail | null;
  summary: ConversationHistorySummary | null;
  onClose: () => void;
  onConfirm: (() => void) | null;
  isConfirming: boolean;
  error: string | null;
}) {
  if (!open || !detail) {
    return null;
  }

  return (
    <div className="history-drawer-overlay" onClick={onClose} role="presentation">
      <aside
        className="history-drawer"
        onClick={(event) => event.stopPropagation()}
        aria-label="会話詳細"
      >
        <div className="history-drawer-header">
          <div>
            <p className="eyebrow">Conversation Detail</p>
            <h2>{summary?.analysisTitle ?? detail.conversationId}</h2>
            <p className="helper-text">
              {formatDateTime(detail.callMeta.startedAt)} /{" "}
              {summarizeSource(detail.source, detail.channel)} / {detail.status}
            </p>
          </div>
          <button type="button" className="ghost-button" onClick={onClose}>
            閉じる
          </button>
        </div>

        {summary?.transcriptSummary ? (
          <div className="selected-summary drawer-summary">
            <p>{summary.transcriptSummary}</p>
          </div>
        ) : null}

        <div className="drawer-chip-row">
          <span className="drawer-chip">
            {detail.memo.service_line
              ? SERVICE_LINE_LABELS[detail.memo.service_line]
              : "区分未取得"}
          </span>
          <span className="drawer-chip">
            {detail.appointmentDraft
              ? SUBMISSION_STATE_LABELS[detail.appointmentDraft.submissionState]
              : "ドラフトなし"}
          </span>
          <span className="drawer-chip">{formatOptional(detail.callMeta.durationSecs)} sec</span>
        </div>

        <div className="history-drawer-body">
          <MemoTable title="受付メモ" memo={detail.memo} />
          <AppointmentDraftCard
            title="アポツールドラフト"
            draft={detail.appointmentDraft}
            onConfirm={onConfirm}
            isConfirming={isConfirming}
            error={error}
          />
          <EvaluationTable
            title="評価結果"
            evaluation={detail.analysis.evaluationCriteriaResults}
          />
          <TranscriptCard
            title="過去の transcript"
            subtitle="この会話で実際にやり取りされた内容です。"
            transcript={detail.transcript}
            emptyText="この会話の transcript はまだありません。"
          />
          <details className="card collapsible-card">
            <summary>技術詳細を開く</summary>
            <div className="collapsible-body">
              <DetailMeta detail={detail} />
              <LatencyTable title="レイテンシ" sample={detail.latency} />
            </div>
          </details>
        </div>
      </aside>
    </div>
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
    analysisStatus,
    lifecycleStatus,
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
  const [isHistoryDetailOpen, setIsHistoryDetailOpen] = useState(false);
  const [outboundNumber, setOutboundNumber] = useState(defaultOutboundNumber);
  const [isPlacingCall, setIsPlacingCall] = useState(false);
  const [outboundCallError, setOutboundCallError] = useState<string | null>(null);
  const [outboundCallResult, setOutboundCallResult] = useState<OutboundCallResult | null>(
    null
  );
  const [importError, setImportError] = useState<string | null>(null);
  const [isImportingPhoneCall, setIsImportingPhoneCall] = useState(false);
  const [appointmentActionError, setAppointmentActionError] = useState<string | null>(null);
  const [isConfirmingConversationId, setIsConfirmingConversationId] = useState<string | null>(
    null
  );
  const [liveAppointmentOverride, setLiveAppointmentOverride] =
    useState<AppointmentDraft | null>(null);

  const canStart = lifecycleStatus === "idle" || lifecycleStatus === "error";
  const canStop =
    lifecycleStatus === "connecting" ||
    lifecycleStatus === "listening" ||
    lifecycleStatus === "speaking";
  const isAnalysisPending = analysisStatus === "pending";

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

  const liveAppointmentDraft = liveAppointmentOverride ?? analysisResult?.appointmentDraft ?? null;

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
      setIsHistoryDetailOpen(true);
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

        const nextSelectedId = preferredConversationId ?? selectedHistoryId ?? null;

        if (
          nextSelectedId &&
          payload.items.some((item) => item.conversationId === nextSelectedId)
        ) {
          setSelectedHistoryId(nextSelectedId);
        } else if (!payload.items[0]) {
          setSelectedHistoryId(null);
          setSelectedHistoryDetail(null);
          setIsHistoryDetailOpen(false);
        }
      } catch (loadError) {
        setHistoryError(
          loadError instanceof Error ? loadError.message : "Failed to load conversation history."
        );
      } finally {
        setIsLoadingHistory(false);
      }
    },
    [selectedHistoryId]
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
      setLiveAppointmentOverride(null);
      void refreshHistory(analysisResult.conversationId);
    }
  }, [analysisResult?.conversationId, refreshHistory]);

  useEffect(() => {
    if (!analysisResult) {
      setLiveAppointmentOverride(null);
    }
  }, [analysisResult]);

  useEffect(() => {
    if (defaultOutboundNumber) {
      return;
    }

    let isCancelled = false;

    void (async () => {
      try {
        const response = await fetch("/api/demo/defaults");
        const payload = (await response.json()) as {
          demoOutboundTargetNumber?: string;
        };

        if (!response.ok || isCancelled) {
          return;
        }

        if (typeof payload.demoOutboundTargetNumber === "string") {
          setOutboundNumber((current) =>
            current.length > 0 ? current : payload.demoOutboundTargetNumber ?? ""
          );
        }
      } catch {
        // Best effort only.
      }
    })();

    return () => {
      isCancelled = true;
    };
  }, [defaultOutboundNumber]);

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
        analysisState: "ready",
      });
      setSelectedHistoryId(imported.conversationId);
      setIsHistoryDetailOpen(true);
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

  async function handleConfirmAppointment(
    conversationIdToConfirm: string,
    target: "live" | "history"
  ) {
    setAppointmentActionError(null);
    setIsConfirmingConversationId(conversationIdToConfirm);

    try {
      const response = await fetch("/api/demo/appointments/confirm", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ conversationId: conversationIdToConfirm }),
      });
      const payload = (await response.json()) as
        | { appointmentDraft: AppointmentDraft }
        | { error?: string };

      if (!response.ok || !("appointmentDraft" in payload)) {
        throw new Error(
          "error" in payload && typeof payload.error === "string"
            ? payload.error
            : "Failed to confirm the appointment draft."
        );
      }

      const nextDraft = payload.appointmentDraft;

      setHistoryItems((current) =>
        current.map((item) =>
          item.conversationId === conversationIdToConfirm
            ? { ...item, appointmentDraft: nextDraft }
            : item
        )
      );

      if (target === "live") {
        setLiveAppointmentOverride(nextDraft);
      }

      setSelectedHistoryDetail((current) =>
        current && current.conversationId === conversationIdToConfirm
          ? { ...current, appointmentDraft: nextDraft }
          : current
      );
    } catch (confirmError) {
      setAppointmentActionError(
        confirmError instanceof Error
          ? confirmError.message
          : "Failed to confirm the appointment draft."
      );
    } finally {
      setIsConfirmingConversationId(null);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero card">
        <div className="hero-copy">
          <p className="eyebrow">Emiha Reception Demo</p>
          <h1>えみは総合歯科 大阪梅田院 AI受付デモ</h1>
          <p className="lead">
            Web 会話、実電話、過去会話の transcript、評価結果、仮受付ドラフト、アポツール投入用 payload を同じ画面で確認できます。
          </p>
          <div className="button-row">
            <Link href="/voice-lab" className="ghost-button inline-link-button">
              Voice Lab を開く
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

      <section className="layout-grid">
        <div className="stack">
          <ClinicProfileCard />

          <section className="card">
            <div className="section-heading">
              <h2>Web 会話</h2>
              <p>ブラウザから会話し、終了後に仮受付メモとドラフトを確認します。</p>
            </div>
            <div className="live-status-row">
              <StatusBadge status={lifecycleStatus} />
              <span className="drawer-chip">
                {conversationId ? `ID: ${conversationId.slice(0, 12)}...` : "会話前"}
              </span>
              {latencySample?.firstAgentResponseMs ? (
                <span className="drawer-chip">
                  初回応答 {formatMillis(latencySample.firstAgentResponseMs)}
                </span>
              ) : null}
            </div>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={startConversation}
                disabled={!canStart || isStarting}
              >
                {isStarting ? "接続中..." : "開始"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={stopConversation}
                disabled={!canStop || isStarting}
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
            {isAnalysisPending ? <p className="helper-text">analysis pending...</p> : null}
            {error ? <p className="error-text">{error}</p> : null}
          </section>

          <TranscriptCard
            title="ライブ transcript"
            subtitle="現在の Web 会話の発話を逐次表示します。"
            transcript={transcript}
            emptyText={liveTranscriptPlaceholder}
          />

          {analysisResult ? (
            <>
              <MemoTable title="Web 会話の受付メモ" memo={analysisResult.memo} />
              <AppointmentDraftCard
                title="Web 会話のアポツールドラフト"
                draft={liveAppointmentDraft}
                onConfirm={
                  analysisResult.conversationId
                    ? () =>
                        void handleConfirmAppointment(
                          analysisResult.conversationId,
                          "live"
                        )
                    : null
                }
                isConfirming={isConfirmingConversationId === analysisResult.conversationId}
                error={
                  isConfirmingConversationId === analysisResult.conversationId ||
                  appointmentActionError === null
                    ? null
                    : appointmentActionError
                }
              />
              <details className="card collapsible-card">
                <summary>接続ログとレイテンシを開く</summary>
                <div className="collapsible-body">
                  <SessionEventList events={sessionEvents} />
                  <LatencyTable title="Web 会話のレイテンシ" sample={latencySample} />
                </div>
              </details>
            </>
          ) : null}
        </div>

        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <h2>最近の会話履歴</h2>
              <p>
                Web と電話の過去会話を一覧表示します。詳細は開いたときだけ表示します。
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
              <button
                type="button"
                className="primary-button"
                onClick={handleImportLatestPhoneCall}
                disabled={isImportingPhoneCall}
              >
                {isImportingPhoneCall ? "取り込み中..." : "最新の電話会話を取り込む"}
              </button>
            </div>
            {historyError ? <p className="error-text">{historyError}</p> : null}
            {importError ? <p className="error-text">{importError}</p> : null}
            {detailError ? <p className="error-text">{detailError}</p> : null}
            {isLoadingHistoryDetail ? (
              <p className="placeholder-text">詳細を読み込み中です。</p>
            ) : null}
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
                E.164 形式です。`DEMO_OUTBOUND_TARGET_NUMBER` を入れると初期表示されます。発信元と同じ番号は指定しないでください。
              </p>
              <p className="helper-text">
                Twilio Trial アカウントでは、接続直後に英語の trial アナウンスが先に流れます。AI 本体はその後に始まるため、数秒はそのまま待ってください。英語案内なしで始めたい場合は Twilio を有料化する必要があります。
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
              <>
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
                  <div>
                    <dt>Twilio account</dt>
                    <dd>{formatOptional(outboundCallResult.twilioAccountType)}</dd>
                  </div>
                  <div>
                    <dt>resolve phone ms</dt>
                    <dd>{formatMillis(outboundCallResult.outboundMetrics.resolvePhoneNumberMs)}</dd>
                  </div>
                  <div>
                    <dt>twilio lookup ms</dt>
                    <dd>{formatMillis(outboundCallResult.outboundMetrics.twilioAccountLookupMs)}</dd>
                  </div>
                  <div>
                    <dt>outbound request ms</dt>
                    <dd>{formatMillis(outboundCallResult.outboundMetrics.outboundRequestMs)}</dd>
                  </div>
                  <div>
                    <dt>outbound total ms</dt>
                    <dd>{formatMillis(outboundCallResult.outboundMetrics.totalMs)}</dd>
                  </div>
                </dl>
                {outboundCallResult.warnings.length > 0 ? (
                  <div className="stack-tight">
                    {outboundCallResult.warnings.map((warning) => (
                      <p key={warning} className="warning-text">
                        {warning}
                      </p>
                    ))}
                  </div>
                ) : null}
              </>
            ) : null}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>即日デモ手順</h2>
              <p>
                Twilio outbound と仮受付ドラフト確認までを前提にしたデモ手順です。
              </p>
            </div>
            <ol className="ordered-list">
              <li>`.env` を設定して `npm run agent:apply-demo-config` で prompt を反映する。</li>
              <li>この画面の `AI から電話をかける` から発信する。</li>
              <li>Twilio Trial の場合は、最初に英語の trial アナウンスが流れ終わるまで待つ。</li>
              <li>その後に電話で予約会話を行う。</li>
              <li>通話後に `最新の電話会話を取り込む` を実行する。</li>
              <li>`確認してアポ登録` を押して、payload を見ながらアポツールへ手動登録する。</li>
              <li>`npm run demo:import-last-call` で Markdown 記録も保存する。</li>
            </ol>
          </section>
        </div>
      </section>

      <HistoryDetailDrawer
        open={isHistoryDetailOpen}
        detail={selectedHistoryDetail}
        summary={selectedSummary}
        onClose={() => setIsHistoryDetailOpen(false)}
        onConfirm={
          selectedHistoryDetail
            ? () => void handleConfirmAppointment(selectedHistoryDetail.conversationId, "history")
            : null
        }
        isConfirming={
          Boolean(
            selectedHistoryDetail &&
              isConfirmingConversationId === selectedHistoryDetail.conversationId
          )
        }
        error={
          selectedHistoryDetail &&
          isConfirmingConversationId !== selectedHistoryDetail.conversationId
            ? appointmentActionError
            : null
        }
      />
    </main>
  );
}

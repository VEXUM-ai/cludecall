"use client";

import { useMemo, useState } from "react";

import { useConversationController } from "@/components/conversation-provider";
import type { DemoRun, LatencySample, OutboundCallResult } from "@/lib/types";

function StatusBadge({ status }: { status: string }) {
  return <span className={`status-badge status-${status}`}>{status}</span>;
}

function MemoTable({
  title,
  memo,
}: {
  title: string;
  memo: DemoRun["memo"];
}) {
  const rows = [
    ["patient_name", memo.patient_name],
    ["phone_number", memo.phone_number],
    [
      "is_new_patient",
      memo.is_new_patient === null ? null : memo.is_new_patient ? "はい" : "いいえ",
    ],
    ["visit_reason", memo.visit_reason],
    ["preferred_date_1", memo.preferred_date_1],
    ["preferred_time_range_1", memo.preferred_time_range_1],
    ["preferred_date_2", memo.preferred_date_2],
    ["preferred_time_range_2", memo.preferred_time_range_2],
    ["callback_ok", memo.callback_ok === null ? null : memo.callback_ok ? "はい" : "いいえ"],
    ["unresolved_questions", memo.unresolved_questions],
    ["notes_for_staff", memo.notes_for_staff],
    ["booking_status", memo.booking_status],
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
            <dd>{value ?? "未取得"}</dd>
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
            <dd>{value ?? "未取得"}</dd>
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
    error,
    isStarting,
    isAnalyzing,
    lifecycleStatus,
    sdkStatus,
    startConversation,
    stopConversation,
    clearResult,
  } = useConversationController();

  const [isImportingPhoneCall, setIsImportingPhoneCall] = useState(false);
  const [phoneDemoRun, setPhoneDemoRun] = useState<DemoRun | null>(null);
  const [phoneImportError, setPhoneImportError] = useState<string | null>(null);
  const [outboundNumber, setOutboundNumber] = useState(defaultOutboundNumber);
  const [isPlacingCall, setIsPlacingCall] = useState(false);
  const [outboundCallError, setOutboundCallError] = useState<string | null>(null);
  const [outboundCallResult, setOutboundCallResult] = useState<OutboundCallResult | null>(null);

  const canStart = lifecycleStatus === "idle" || lifecycleStatus === "error";
  const canStop =
    lifecycleStatus === "connecting" ||
    lifecycleStatus === "listening" ||
    lifecycleStatus === "speaking";

  const transcriptPlaceholder = useMemo(() => {
    if (canStop) {
      return "会話中です。話者ごとの transcript がここに流れます。";
    }
    return "開始すると transcript を表示します。";
  }, [canStop]);

  async function handleImportLatestPhoneCall() {
    setPhoneImportError(null);
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
      setPhoneDemoRun(payload as DemoRun);
    } catch (importError) {
      setPhoneImportError(
        importError instanceof Error
          ? importError.message
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
    } catch (callError) {
      setOutboundCallError(
        callError instanceof Error ? callError.message : "Failed to place the outbound call."
      );
    } finally {
      setIsPlacingCall(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero card">
        <div className="hero-copy">
          <p className="eyebrow">Dental Receptionist Demo</p>
          <h1>歯科一次受付AI デモ</h1>
          <p className="lead">
            Web 会話と実電話会話の両方で、仮受付メモを ElevenLabs の analysis から回収するデモです。
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
              <h2>WebRTC デモ</h2>
              <p>ブラウザから agent に接続して会話し、終話後に memo を取得します。</p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="primary-button"
                onClick={startConversation}
                disabled={!canStart || isStarting || isAnalyzing}
              >
                {isStarting ? "開始中..." : "開始"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={stopConversation}
                disabled={!canStop || isStarting || isAnalyzing}
              >
                {isAnalyzing ? "分析中..." : "終了してメモ取得"}
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

          <section className="card transcript-card">
            <div className="section-heading">
              <h2>ライブ transcript</h2>
              <p>ユーザーと agent の発話を逐次表示します。</p>
            </div>
            {transcript.length === 0 ? (
              <p className="placeholder-text">{transcriptPlaceholder}</p>
            ) : (
              <div className="transcript-list" aria-live="polite">
                {transcript.map((entry) => (
                  <article key={entry.id} className={`transcript-entry ${entry.role}`}>
                    <header>
                      <span>{entry.role === "user" ? "User" : "Agent"}</span>
                      {entry.tentative ? <em>tentative</em> : null}
                    </header>
                    <p>{entry.text}</p>
                  </article>
                ))}
              </div>
            )}
          </section>

          {analysisResult ? (
            <MemoTable title="Web 会話の仮受付メモ" memo={analysisResult.memo} />
          ) : null}

          <LatencyTable title="Web 会話のレイテンシ" sample={latencySample} />
        </div>

        <div className="stack">
          <section className="card">
            <div className="section-heading">
              <h2>AI から電話をかける</h2>
              <p>アプリから ElevenLabs の outbound call API を呼び出して、指定した番号へテスト架電します。</p>
            </div>
            <div className="field-stack">
              <label className="field-label" htmlFor="outbound-number">
                発信先電話番号
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
                E.164 形式推奨。既定値には `.env` の電話番号を入れています。
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
                  <dd>{outboundCallResult.conversationId ?? "未取得"}</dd>
                </div>
                <div>
                  <dt>callSid</dt>
                  <dd>{outboundCallResult.callSid ?? "未取得"}</dd>
                </div>
                <div>
                  <dt>agent phone</dt>
                  <dd>{outboundCallResult.agentPhoneNumber ?? "未取得"}</dd>
                </div>
              </dl>
            ) : null}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>最新の電話会話を取り込む</h2>
              <p>
                outbound-only 電話デモまたは将来の inbound デモ後に、最新 completed conversation を回収します。
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
            {phoneImportError ? <p className="error-text">{phoneImportError}</p> : null}
          </section>

          <section className="card">
            <div className="section-heading">
              <h2>即日デモ手順</h2>
              <p>Twilio 日本着信番号の審査前でも、outbound-only で今日中に電話デモできます。</p>
            </div>
            <ol className="ordered-list">
              <li>`.env` を設定し、`npm run agent:apply-demo-config` で歯科受付用 prompt を反映する。</li>
              <li>Twilio Verified Caller ID または既存番号を ElevenLabs に import する。</li>
              <li>この画面の `AI から電話をかける` か、ElevenLabs ダッシュボードから outbound call を送る。</li>
              <li>終話後にこの画面か CLI で最新通話を回収する。</li>
              <li>`npm run demo:import-last-call` で Markdown 証跡を保存する。</li>
            </ol>
          </section>

          {phoneDemoRun ? (
            <>
              <section className="card">
                <div className="section-heading">
                  <h3>電話デモのメタデータ</h3>
                </div>
                <dl className="meta-grid">
                  <div>
                    <dt>conversation_id</dt>
                    <dd>{phoneDemoRun.conversationId}</dd>
                  </div>
                  <div>
                    <dt>channel</dt>
                    <dd>{phoneDemoRun.channel}</dd>
                  </div>
                  <div>
                    <dt>startedAt</dt>
                    <dd>{phoneDemoRun.callMeta.startedAt ?? "不明"}</dd>
                  </div>
                  <div>
                    <dt>durationSecs</dt>
                    <dd>{phoneDemoRun.callMeta.durationSecs ?? "不明"}</dd>
                  </div>
                  <div>
                    <dt>maskedCaller</dt>
                    <dd>{phoneDemoRun.callMeta.maskedCaller ?? "不明"}</dd>
                  </div>
                  <div>
                    <dt>reported cost</dt>
                    <dd>{phoneDemoRun.cost ?? "不明"}</dd>
                  </div>
                </dl>
              </section>
              <MemoTable title="電話会話の仮受付メモ" memo={phoneDemoRun.memo} />
              <LatencyTable title="電話会話のレイテンシ" sample={phoneDemoRun.latency} />
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

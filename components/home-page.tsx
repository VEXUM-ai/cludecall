"use client";

import { useMemo, useState } from "react";

import { useConversationController } from "@/components/conversation-provider";
import type { DemoRun, LatencySample, OutboundCallResult } from "@/lib/types";

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

function formatAudioLevel(value: number) {
  return `${Math.round(value * 100)}%`;
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
    audioDiagnostics,
    availableOutputDevices,
    speakerSelectionSupported,
    startConversation,
    stopConversation,
    clearResult,
    refreshOutputDevices,
    selectOutputDevice,
    playSpeakerTest,
  } = useConversationController();

  const [isImportingPhoneCall, setIsImportingPhoneCall] = useState(false);
  const [phoneDemoRun, setPhoneDemoRun] = useState<DemoRun | null>(null);
  const [phoneImportError, setPhoneImportError] = useState<string | null>(null);
  const [outboundNumber, setOutboundNumber] = useState(defaultOutboundNumber);
  const [isPlacingCall, setIsPlacingCall] = useState(false);
  const [outboundCallError, setOutboundCallError] = useState<string | null>(null);
  const [outboundCallResult, setOutboundCallResult] = useState<OutboundCallResult | null>(
    null
  );
  const [isRefreshingOutputs, setIsRefreshingOutputs] = useState(false);
  const [isPlayingSpeakerTest, setIsPlayingSpeakerTest] = useState(false);
  const [isSwitchingOutput, setIsSwitchingOutput] = useState(false);

  const canStart = lifecycleStatus === "idle" || lifecycleStatus === "error";
  const canStop =
    lifecycleStatus === "connecting" ||
    lifecycleStatus === "listening" ||
    lifecycleStatus === "speaking";

  const transcriptPlaceholder = useMemo(() => {
    if (canStop) {
      return "会話中です。発話ごとの transcript をここに表示します。";
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

  async function handleRefreshOutputs() {
    setIsRefreshingOutputs(true);
    try {
      await refreshOutputDevices();
    } finally {
      setIsRefreshingOutputs(false);
    }
  }

  async function handleOutputDeviceChange(deviceId: string) {
    setIsSwitchingOutput(true);
    try {
      await selectOutputDevice(deviceId || null);
    } finally {
      setIsSwitchingOutput(false);
    }
  }

  async function handlePlaySpeakerTest() {
    setIsPlayingSpeakerTest(true);
    try {
      await playSpeakerTest();
    } finally {
      setIsPlayingSpeakerTest(false);
    }
  }

  return (
    <main className="page-shell">
      <section className="hero card">
        <div className="hero-copy">
          <p className="eyebrow">Dental Receptionist Demo</p>
          <h1>歯科一次受付 AI デモ</h1>
          <p className="lead">
            Web 会話と実電話の両方で、会話後に受付メモとレイテンシを回収するデモです。
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
              <h2>音声出力チェック</h2>
              <p>
                声が聞こえない場合は、ここでスピーカー経路と AI 音声の到達状況を確認できます。
              </p>
            </div>
            <div className="field-stack">
              <label className="field-label" htmlFor="output-device">
                出力デバイス
              </label>
              <select
                id="output-device"
                className="text-input"
                value={audioDiagnostics.selectedOutputDeviceId ?? ""}
                onChange={(event) => void handleOutputDeviceChange(event.target.value)}
                disabled={!speakerSelectionSupported || isSwitchingOutput}
              >
                <option value="">システム既定のスピーカー</option>
                {availableOutputDevices.map((device) => (
                  <option key={device.id} value={device.id}>
                    {device.label}
                  </option>
                ))}
              </select>
              <p className="helper-text">
                {speakerSelectionSupported
                  ? "Chrome / Edge 系では出力先を切り替えられます。"
                  : "このブラウザは出力デバイスの切り替えに対応していません。"}
              </p>
            </div>
            <div className="button-row">
              <button
                type="button"
                className="ghost-button"
                onClick={handleRefreshOutputs}
                disabled={isRefreshingOutputs}
              >
                {isRefreshingOutputs ? "再取得中..." : "出力デバイスを再取得"}
              </button>
              <button
                type="button"
                className="secondary-button"
                onClick={handlePlaySpeakerTest}
                disabled={isPlayingSpeakerTest}
              >
                {isPlayingSpeakerTest ? "再生中..." : "スピーカーテスト"}
              </button>
            </div>
            <dl className="meta-grid diagnostics-grid">
              <div>
                <dt>transport</dt>
                <dd>{audioDiagnostics.transport}</dd>
              </div>
              <div>
                <dt>browser audio unlocked</dt>
                <dd>{audioDiagnostics.browserAudioUnlocked ? "yes" : "no"}</dd>
              </div>
              <div>
                <dt>requested volume</dt>
                <dd>{formatAudioLevel(audioDiagnostics.requestedVolume)}</dd>
              </div>
              <div>
                <dt>input level</dt>
                <dd>{formatAudioLevel(audioDiagnostics.inputLevel)}</dd>
              </div>
              <div>
                <dt>output level</dt>
                <dd>{formatAudioLevel(audioDiagnostics.outputLevel)}</dd>
              </div>
              <div>
                <dt>audio packets received</dt>
                <dd>{audioDiagnostics.receivedAudioEvents}</dd>
              </div>
              <div>
                <dt>last audio packet</dt>
                <dd>{formatOptional(audioDiagnostics.lastAudioEventAt)}</dd>
              </div>
              <div>
                <dt>selected speaker</dt>
                <dd>{audioDiagnostics.selectedOutputDeviceLabel ?? "システム既定"}</dd>
              </div>
            </dl>
            <p className="helper-text">
              スピーカーテストが聞こえるのに agent の声だけ聞こえない場合は、会話開始後に
              `audio packets received` が増えるかを確認してください。
            </p>
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
            <MemoTable title="Web 会話の受付メモ" memo={analysisResult.memo} />
          ) : null}

          <LatencyTable title="Web 会話のレイテンシ" sample={latencySample} />
        </div>

        <div className="stack">
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
              <h2>最新の電話会話を取り込む</h2>
              <p>
                outbound-only デモ向けです。直近の completed conversation を取得してメモ化します。
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
                    <dd>{formatOptional(phoneDemoRun.callMeta.startedAt)}</dd>
                  </div>
                  <div>
                    <dt>durationSecs</dt>
                    <dd>{formatOptional(phoneDemoRun.callMeta.durationSecs)}</dd>
                  </div>
                  <div>
                    <dt>maskedCaller</dt>
                    <dd>{formatOptional(phoneDemoRun.callMeta.maskedCaller)}</dd>
                  </div>
                  <div>
                    <dt>reported cost</dt>
                    <dd>{formatOptional(phoneDemoRun.cost)}</dd>
                  </div>
                </dl>
              </section>
              <MemoTable title="電話会話の受付メモ" memo={phoneDemoRun.memo} />
              <LatencyTable title="電話会話のレイテンシ" sample={phoneDemoRun.latency} />
            </>
          ) : null}
        </div>
      </section>
    </main>
  );
}

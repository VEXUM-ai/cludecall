# Implementation Journal

## 2026-04-07

### Checkpoint: 公開情報と FAQ を managed knowledge base に分離
- Added [`lib/agent-knowledge-base.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-knowledge-base.ts) to generate two managed KB documents from the typed clinic config: `emiha-public-facts-*` and `emiha-faq-*`.
- Updated [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) so the system prompt now keeps only a short clinic summary plus KB usage guidance, instead of inlining the full public-facts and FAQ payload.
- Updated [`scripts/apply-agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/scripts/apply-agent-demo-config.ts) so `npm run agent:apply-demo-config` now creates or reuses those KB documents via the ElevenLabs API, attaches them to the agent prompt, and enables RAG when managed `auto` documents are present.
- Decision: keep flow, guardrails, name-handling rules, and closing rules in the prompt; move public knowledge into KB; avoid moving booking-control behavior into KB.

### Checkpoint: monitor root cause confirmed and remote config fallback added
- Verified against the live ElevenLabs agent API that the remote agent still had `conversation_config.conversation.monitoring_enabled = false`, `turn_eagerness = eager`, and the old phone prompt before re-apply.
- Proved the monitor failure cause directly by sending a minimal PATCH with `monitoring_enabled = true`, which returned `403` with `feature_not_available` / `monitoring_enterprise_only` and the message `Real-time monitoring is an enterprise-only feature. Please upgrade your subscription.`
- Updated [`scripts/apply-agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/scripts/apply-agent-demo-config.ts) so config sync now retries without monitoring when ElevenLabs rejects the enterprise-only feature, instead of aborting the whole update.
- Updated [`lib/phone-live-monitor.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/phone-live-monitor.ts) so phone monitoring first probes the remote agent config and skips immediately when realtime monitoring is disabled, rather than opening a websocket that predictably dies.
- Updated [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) and [`lib/agent-speed-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-speed-config.ts) to make the overall conversation speed more normal: `expressive_mode = false`, `tts_speed = 0.95`, `turn_timeout = 8`, `turn_eagerness = normal`, plus an explicit “do not rapid-fire after hesitations” rule.
- Validation: `npm run lint`, `npm run build`, and `npm run agent:apply-demo-config` now succeed. The remote agent reflects `turn_timeout = 8`, `turn_eagerness = normal`, `tts.speed = 0.95`, `expressive_mode = false`, while `monitoringEnabled` remains `false` by plan limitation.

### Checkpoint: rapid-fire reprompt guard added for telephony
- Refined the phone bug analysis after the user's note that the agent started talking `間髪入れず連発` near the end.
- Updated [`lib/agent-speed-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-speed-config.ts) to raise the phone turn timeout from `6s` to `8s` while keeping `turn_eagerness = normal`.
- Updated [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) and [`lib/agent-speed-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-speed-config.ts) to state two additional runtime rules explicitly: if only `preferred_date_2` is collected, ask the time once and then move on with `preferred_time_range_2 = null`; while collecting the second choice, do not resurrect `preferred_date_1`.

### Checkpoint: recording-backed confirmation of the end-of-call loop
- Transcribed the local recording [`通話記録 通知不可能_260407_002955.m4a`](/C:/Dev/Work/デンタル%20一次受付AI/通話記録%20通知不可能_260407_002955.m4a) with Eleven Scribe and confirmed that the missing final `37s` were not just a monitor gap.
- The recording shows the agent looping between `その日のご希望のお時間はございますでしょうか` and the stale reconfirmation `4月16日木曜日の十六時でいいですか`, while the caller keeps repeating `再来週の月曜日とかどうですか`.
- This validated that the earlier fix set in [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) and [`lib/agent-speed-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-speed-config.ts) is aimed at the right runtime failure mode: stale-slot resurrection plus over-persistent second-choice collection.
- Validation rerun: `npm run lint` and `npm run build` still succeed. `npm run agent:apply-demo-config` still fails with `403`, so the runtime fix is still blocked on ElevenLabs-side permissions/publication.

### Checkpoint: repeated end-of-call phone bug analyzed and hardened
- Investigated the latest phone call `conv_1101knhpm2hnf8a949ax2teetp5g` and documented the findings in [`docs/phone-repetition-bug-debug.md`](/C:/Dev/Work/デンタル%20一次受付AI/docs/phone-repetition-bug-debug.md).
- Confirmed that the imported transcript ended at `163s` while the call duration was `200s`, leaving a `37s` tail gap around the segment where the user reported repeated / broken behavior.
- Updated [`lib/agent-speed-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-speed-config.ts) and [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) so the agent now treats second-choice collection as optional, caps same-field clarification attempts, prioritizes callback number collection earlier, and uses `normal` turn eagerness instead of `eager`.
- Updated [`lib/date-preferences.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/date-preferences.ts) to parse Japanese numeral dates such as `四月十六日` and to avoid matching the `月` in calendar months as a weekday token.
- Updated [`lib/phone-live-monitor.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/phone-live-monitor.ts) and [`app/api/demo/outbound-call/route.ts`](/C:/Dev/Work/デンタル%20一次受付AI/app/api/demo/outbound-call/route.ts) so phone realtime monitoring fails fast and is skipped once the agent is known to reject monitoring, rather than repeatedly pretending to connect.
- Updated [`app/api/demo/import-last-call/route.ts`](/C:/Dev/Work/デンタル%20一次受付AI/app/api/demo/import-last-call/route.ts) so a large transcript tail gap is surfaced as a warning immediately after import.
- Validation: `npm run lint` and `npm run build` succeeded. Re-importing `conv_1101knhpm2hnf8a949ax2teetp5g` now normalizes `四月十六日木曜日の十六時` to `2026-04-16` instead of a wrong weekday fallback. `npm run agent:apply-demo-config` still fails with `403`, so the new prompt and turn settings are not yet published to the remote ElevenLabs branch.

### Checkpoint: patient_name_yomi added to prevent kanji name readback
- Updated [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) to add `patient_name_yomi` to data collection and to state two guardrails explicitly: names should be confirmed in hiragana when needed, and kana-unconfirmed kanji names must not be read back.
- Updated [`lib/types.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/types.ts), [`lib/elevenlabs/memo.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/elevenlabs/memo.ts), and [`lib/appointments.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/appointments.ts) so the phonetic name now flows through the normalized memo, appointment draft, and appointment-tool payload.
- Updated [`app/api/eleven/analyze/route.ts`](/C:/Dev/Work/デンタル%20一次受付AI/app/api/eleven/analyze/route.ts), [`app/api/demo/import-last-call/route.ts`](/C:/Dev/Work/デンタル%20一次受付AI/app/api/demo/import-last-call/route.ts), and [`app/api/demo/appointments/confirm/route.ts`](/C:/Dev/Work/デンタル%20一次受付AI/app/api/demo/appointments/confirm/route.ts) so live monitor details include the phonetic name when available.
- Updated [`lib/demo-runs.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/demo-runs.ts), [`docs/agent/README.md`](/C:/Dev/Work/デンタル%20一次受付AI/docs/agent/README.md), and [`docs/agent/dental-demo-config.md`](/C:/Dev/Work/デンタル%20一次受付AI/docs/agent/dental-demo-config.md) to document the new field and the “do not read back unconfirmed kanji names” rule.
- Validation: `npm run lint` and `npm run build` succeeded. `npm run agent:apply-demo-config` failed with `ElevenLabs request failed with 403`, so the local code is ready but the remote agent config still needs credential or permission recovery before re-applying.
- Next: re-apply the agent config, run a few real calls, and verify that names are stored as `patient_name` + `patient_name_yomi` while all spoken readback uses the yomi field only.

### Checkpoint: Japanese name pronunciation research documented
- Added [`docs/agent/japanese-name-pronunciation-research.md`](/C:/Dev/Work/デンタル%20一次受付AI/docs/agent/japanese-name-pronunciation-research.md) to capture the 2026-04-07 research on how other systems handle Japanese name readings in phone AI.
- Compared ElevenLabs, Google Cloud, Azure AI Speech, AWS, Twilio, Dialogflow CX, and OpenAI Realtime from primary sources.
- Conclusion: mainstream stacks do not expose a public `hiragana only transcript` mode for arbitrary Japanese names; the common pattern is to separate STT transcript from the speech-safe reading field and confirm `patient_name_yomi` explicitly.
- Next: implement `patient_name_yomi`, add a prompt guardrail that blocks kana-unconfirmed kanji name readback, and keep pronunciation dictionaries limited to fixed clinic vocabulary.

### Checkpoint: 音声向けの氏名確認文言と終話ガードを修正
- Latest phone import for `conv_8601knhy0bfef33sqh2fr0w8dn1f` confirmed that the agent literally said `お名前の読み方をひらがなで...`, which was traced back to the prompt in [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts).
- Updated [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) so caller-facing wording now asks only for `読み方` when needed, never asks the caller to answer in hiragana / katakana / kanji, and skips optional end-of-call items when the line is degrading.
- Tightened the closing rule in [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) so the summary is delivered once, in up to three sentences, with long optional-item recap avoided.
- Updated [`lib/agent-speed-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-speed-config.ts) to mirror the same behavior in the speed overlay: pronunciation-only name confirmation, no script-type instructions, skip optional items near the end, and no repeated closing.
- Updated [`app/api/demo/import-last-call/route.ts`](/C:/Dev/Work/デンタル%20一次受付AI/app/api/demo/import-last-call/route.ts) so phone import now records `lastTranscriptRole` / `lastTranscriptPreview` and emits `phone transcript ended during agent playback` when a long tail gap ends on an agent utterance.
- Search across current evidence confirms the same family of issue has recurred at least twice: the previously documented `conv_1101knhpm2hnf8a949ax2teetp5g` loop and the newer `conv_8601knhy0bfef33sqh2fr0w8dn1f` tail-gap case.

### Checkpoint: FAQ と公開情報を managed knowledge base へ切り出し
- Added [`lib/agent-knowledge-base.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-knowledge-base.ts) to define managed ElevenLabs knowledge-base documents for clinic public facts and patient-facing FAQ.
- Updated [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-demo-config.ts) so the prompt now keeps only a compact clinic summary plus explicit guidance to use the attached knowledge base for detailed public information and FAQ.
- Updated [`scripts/apply-agent-demo-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/scripts/apply-agent-demo-config.ts) so `npm run agent:apply-demo-config` now upserts the managed text documents, reuses matching docs when content is unchanged, replaces stale docs when content changed, and attaches them to the agent prompt with `usage_mode = auto`.
- The apply script now prints the managed KB document count and names, so remote sync state is visible after each config push.

## 2026-04-06

### Checkpoint: 発信番号解決を cache 化し Twilio 種別確認を並列化
- Updated [`lib/elevenlabs/api.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/api.ts) to cache outbound-capable phone number resolution for 5 minutes and to cache Twilio account type lookups for 5 minutes.
- Updated [`lib/elevenlabs/api.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/api.ts) so the Twilio account type lookup now runs in parallel with the outbound call request instead of blocking it serially.
- Updated [`app/api/demo/outbound-call/route.ts`](/C:/Dev/Work/デンタル 一次受付AI/app/api/demo/outbound-call/route.ts) and [`scripts/live-monitor.ts`](/C:/Dev/Work/デンタル 一次受付AI/scripts/live-monitor.ts) so cache hit / miss status is visible during outbound timing inspection.
- Next: runbook に確認手順を追記し、実通話で 1 本目と 2 本目以降の差を比較する。

### Checkpoint: 電話発信と analysis polling の時間内訳を可視化
- Updated [`lib/types.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/types.ts) to add `outboundMetrics` and `analysisResolution` so timing breakdowns can move through the API layer.
- Updated [`lib/elevenlabs/api.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/api.ts) so outbound calls now measure `resolvePhoneNumberMs`, `twilioAccountLookupMs`, `outboundRequestMs`, `totalMs`, and conversation analysis now records `analysisRequestMs`, polling attempts, polling wait total, detail fetch total, and overall analysis resolution time.
- Updated [`app/api/demo/outbound-call/route.ts`](/C:/Dev/Work/デンタル 一次受付AI/app/api/demo/outbound-call/route.ts), [`app/api/eleven/analyze/route.ts`](/C:/Dev/Work/デンタル 一次受付AI/app/api/eleven/analyze/route.ts), and [`app/api/demo/import-last-call/route.ts`](/C:/Dev/Work/デンタル 一次受付AI/app/api/demo/import-last-call/route.ts) to emit those timing details into the live monitor.
- Updated [`scripts/live-monitor.ts`](/C:/Dev/Work/デンタル 一次受付AI/scripts/live-monitor.ts) and [`components/home-page.tsx`](/C:/Dev/Work/デンタル 一次受付AI/components/home-page.tsx) so the new timing breakdown is visible from the terminal and the outbound result card.
- Next: cache phone-number resolution and remove Twilio account type lookup from the synchronous outbound critical path.

### Checkpoint: outbound default number reflects runtime env
- Added `export const dynamic = "force-dynamic";` to [`app/page.tsx`](/C:/Dev/Work/デンタル 一次受付AI/app/page.tsx) so the top page reads `DEMO_OUTBOUND_TARGET_NUMBER` at request time.
- Verified `http://localhost:3000` renders `+819047464087` in the outbound number input after restart.
- This change prevents stale build-time values when `.env` is updated for demo operation.

### Next
- Implement relative date handling for intake phrases such as `今週`, `来週`, `再来週`, `平日`, `土日`, `午前`, `午後`.
- Keep raw patient wording and add deterministic normalized ranges for manual review and future appointment-tool automation.

### In progress: relative date normalization
- Added [`lib/date-preferences.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/date-preferences.ts) to normalize relative preference phrases into deterministic date ranges based on `anchorAt` and clinic timezone.
- Wired [`lib/appointments.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/appointments.ts) to attach normalized preferred slot displays and to append interpretation notes into `manualReviewReason` and `handoffSummary`.
- Wired [`lib/elevenlabs/api.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/elevenlabs/api.ts) to use conversation start time as the normalization anchor when available.
- Updated [`lib/agent-demo-config.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/agent-demo-config.ts) so the agent restates relative dates as absolute windows and asks one narrowing follow-up.
- Validation: `npm run lint`, `npm run build`, `npm run agent:apply-demo-config` all succeeded after the relative date changes.

### In progress: terminal live monitor
- Added [`lib/live-monitor.ts`](/C:/Dev/Work/デンタル 一次受付AI/lib/live-monitor.ts) and [`app/api/demo/live-monitor/route.ts`](/C:/Dev/Work/デンタル 一次受付AI/app/api/demo/live-monitor/route.ts) to collect realtime monitor events into `artifacts/live-monitor/events.ndjson`.
- Wired [`components/conversation-provider.tsx`](/C:/Dev/Work/デンタル 一次受付AI/components/conversation-provider.tsx) to stream Web session events, final user lines, final agent lines, analysis completion, and latency summaries into the live monitor.
- Wired server routes for outbound call, Web analysis, phone import, appointment confirmation, and latency persistence to append monitor events for post-call collection visibility.
- Added [`scripts/live-monitor.ts`](/C:/Dev/Work/デンタル 一次受付AI/scripts/live-monitor.ts) and `npm run monitor:live` to follow the NDJSON log from a terminal window in realtime.
- Validation: `npm run lint` and `npm run build` succeeded after the live monitor wiring. The server was restarted and a visible PowerShell window was launched with the monitor script.
### Checkpoint: monitor:live now shows response timing and detail blocks
- Updated `components/conversation-provider.tsx` so user and agent transcript lines publish `elapsedMs`, per-turn `replyAfterUserMs`, and tentative/final state into the live monitor stream.
- Updated the analysis, latency, phone import, outbound, and appointment confirm API routes to emit readable monitor events with structured details for analysis, collection, outbound, appointment, and latency stages.
- Updated `scripts/live-monitor.ts` to expand `details` as multi-line blocks inside `npm run monitor:live`, so response metrics are visible in the terminal without opening the UI.
- Validation: `npm run lint` and `npm run build` succeeded. The app is serving again at `http://localhost:3000`, and a fresh `npm run monitor:live -- --history` terminal was launched with a `monitor ready` event.
### Checkpoint: terminal monitor labels simplified to Japanese
- Updated `scripts/live-monitor.ts` so the terminal now shows `患者`, `AI`, `応答速度`, `収集結果`, `発信`, `仮受付` as simple Japanese labels instead of developer-facing English tags.
- The monitor now translates common session messages into plain Japanese and surfaces only the key fields people care about, such as `接続完了まで`, `AI初回応答まで`, `患者発話からAI平均応答まで`, and `通話後の収集時間`.
### Checkpoint: every AI line now shows response time
- Updated `components/conversation-provider.tsx` so tentative AI lines also publish `replyAfterUserMs`.
- Updated `scripts/live-monitor.ts` so every AI line shows `応答まで: xxxms` before the rest of the detail block.
### In progress: phone realtime monitor hookup
- Added `lib/phone-live-monitor.ts` to connect to ElevenLabs' conversation monitoring WebSocket for active phone calls and append `user_transcript`, `agent_response`, and correction events into the local live monitor log in realtime.
- Wired `app/api/demo/outbound-call/route.ts` so successful outbound calls immediately attempt to start phone realtime monitoring using the returned `conversationId`.
- Added `app/api/demo/phone-monitor/start/route.ts` so an already-running phone call can be attached later by `conversationId`, or by resolving the latest active phone conversation automatically.
- The terminal monitor now translates phone realtime monitor lifecycle messages into Japanese, including retries and auth/plan failures.
### Checkpoint: agent monitoring can be enabled via API
- Confirmed the current agent exposes `conversation_config.conversation.monitoring_enabled` via the ElevenLabs agent API, and it was `false`.
- Updated `scripts/apply-agent-demo-config.ts` so future agent config syncs force `monitoring_enabled: true` and preserve `monitoring_events`.

### Checkpoint: latency headroom review after six-way parallel research
- Pulled six parallel research tracks across repo analysis plus official ElevenLabs, Twilio, and Google docs, then compared them against the current phone metrics.
- Confirmed that outbound setup is already relatively small in the current architecture, while the largest remaining user-facing delay is mid-call `reply_after_user` latency.
- Queried the live ElevenLabs agent before the update and confirmed it was still heavier than the repo defaults: `turn_timeout = 8`, `turn_eagerness = normal`, `max_tokens = 180`, `tts.speed = 0.95`, `tts.model_id = eleven_v3_conversational`, `monitoring_enabled = false`, and prompt length was about `9749` characters.
- Updated [`lib/agent-speed-config.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/agent-speed-config.ts) to trim the speed overlay significantly and reduce `DENTAL_DEMO_FAST_MAX_TOKENS` from `180` to `120` while keeping normal pacing defaults.
- Updated [`app/api/demo/import-last-call/route.ts`](/C:/Dev/Work/デンタル%20一次受付AI/app/api/demo/import-last-call/route.ts) so phone import no longer blocks on transcript mirroring before returning the API response.
- Updated [`lib/elevenlabs/api.ts`](/C:/Dev/Work/デンタル%20一次受付AI/lib/elevenlabs/api.ts) to allow optional Twilio region-aware REST calls via `TWILIO_API_EDGE` and `TWILIO_API_REGION`.
- Re-ran `npm run agent:apply-demo-config` successfully. The live agent now reflects `turn_timeout = 7`, `turn_eagerness = normal`, `max_tokens = 120`, `tts.speed = 1.0`, `tts.model_id = eleven_v3_conversational`, and `monitoring_enabled = false`.
- Decision: stay on the current managed telephony path for now, apply the lighter branch config, and only escalate to Twilio ConversationRelay / Media Streams if the slimmer prompt and shorter outputs still miss the latency target.

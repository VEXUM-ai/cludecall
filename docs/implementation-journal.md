# Implementation Journal

## 2026-04-06

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

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

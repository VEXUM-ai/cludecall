# Implementation Journal

## 2026-04-06

### Checkpoint: outbound default number reflects runtime env
- Added `export const dynamic = "force-dynamic";` to [`app/page.tsx`](/C:/Dev/Work/デンタル 一次受付AI/app/page.tsx) so the top page reads `DEMO_OUTBOUND_TARGET_NUMBER` at request time.
- Verified `http://localhost:3000` renders `+819047464087` in the outbound number input after restart.
- This change prevents stale build-time values when `.env` is updated for demo operation.

### Next
- Implement relative date handling for intake phrases such as `今週`, `来週`, `再来週`, `平日`, `土日`, `午前`, `午後`.
- Keep raw patient wording and add deterministic normalized ranges for manual review and future appointment-tool automation.

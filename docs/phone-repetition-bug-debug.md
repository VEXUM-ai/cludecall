# Phone Repetition Bug Debug

Last updated: 2026-04-07

## Target call

- conversationId: `conv_1101knhpm2hnf8a949ax2teetp5g`
- startedAt: `2026-04-07 00:29:55 JST`
- durationSecs: `200`
- import completed at: `2026-04-07 00:34:53 JST`

## What happened

The call progressed normally until the second preferred slot collection.

Observed sequence:

1. The caller asked clinic-name and holiday FAQ mid-intake.
2. The agent answered and correctly returned to the booking flow.
3. The caller changed the first preferred slot once.
4. The agent then asked for a second preferred slot and, after receiving `再来週の月曜日`, asked for the time.
5. The imported transcript stops at `timeInCallSecs=163`, while the full call duration is `200s`.

## Evidence

- `firstAgentReplyAfterUserMs = 7000`
- `averageAgentReplyAfterUserMs = 5500`
- `analysisMs = 9656`
- transcript lines imported: `21`
- transcript tail gap: about `37s`
- phone realtime monitor failed with `close_1008` / `Monitoring is not enabled for this agent`

Implication:

- The call tail where the user heard the repeated / broken behavior is not captured in realtime monitor logs.
- The imported transcript also ends significantly before call completion, so the final segment was under-observed.

## Root-cause analysis

### 1. Conversation design pushed too hard on the same unresolved field

The intake flow treated the second preferred slot as part of the normal sequence. Even though the data model already allowed `preferred_date_2` and `preferred_time_range_2` to be `null`, the prompt did not clearly tell the agent to stop pressing on that field.

Result:

- If the user hesitated, changed their mind, or wanted to end after one viable candidate, the agent could keep pulling the conversation back to the same unresolved field.

### 2. Turn setting favored interruption-sensitive behavior

The fast config had `turn_eagerness = eager`.

Result:

- On telephony, with hesitations like `えっと`, self-corrections, and mid-flow FAQ, the agent was more likely to react on partial turns.
- In the target call, the first preferred slot confirmation was interrupted by a user correction, which is the exact shape that tends to produce repeated or truncated confirmations later in the call.

### 3. Monitoring design failed to preserve the decisive tail segment

The phone realtime monitor was attempted even when monitoring was unavailable for the agent and returned `close_1008`.

Result:

- The system did not capture the end-of-call behavior with enough fidelity.
- This made the bug harder to diagnose than it should have been.

### 4. Date normalization had a separate parsing bug

The post-call resolver could misread weekday mentions because `月` in `四月` could be matched as Monday when explicit numeric parsing failed. It also did not parse month/day written in Japanese numerals such as `四月十六日`.

Result:

- Post-call notes could contain wrong normalized dates, which makes debugging and staff handoff less trustworthy.

## Fixes applied

1. Made `preferred_date_2` / `preferred_time_range_2` explicitly optional in the prompt and instructed the agent not to loop on them.
2. Added a rule: same-field clarification is capped at two attempts, after which the issue goes to `unresolved_questions`.
3. Reordered the flow so callback phone number is collected before the optional second preferred slot.
4. Changed fast turn eagerness from `eager` to `normal`.
5. Updated the prompt to discard old slot candidates when the caller corrects themselves and to confirm only the latest value.
6. Made phone realtime monitoring fail fast and skip future attempts once the agent is known to reject monitoring.
7. Added transcript tail-gap detection during phone import so under-observed call endings are surfaced immediately.
8. Fixed post-call date parsing so Japanese numeral dates like `四月十六日` are parsed and weekday detection no longer mistakes month markers for weekdays.

## Remaining operational step

`npm run agent:apply-demo-config` is currently failing with `403`, so the local prompt / turn-setting fixes are implemented in code but not yet re-applied to the remote ElevenLabs agent branch.

## Next validation

1. Recover ElevenLabs permissions and re-apply the agent config.
2. Run at least 3 real phone calls with deliberate hesitations, mid-intake FAQ, slot change, and no-second-choice cases.
3. Confirm that:
   - the agent stops after one unresolved second-choice clarification,
   - callback phone is collected earlier,
   - no repeated question loop appears near the end,
   - phone import warns immediately if transcript coverage ends well before call duration.

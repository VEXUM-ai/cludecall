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
- `analysisMs = 10183`
- transcript lines imported: `21`
- transcript tail gap: about `37s`
- phone realtime monitor failed with `close_1008` / `Monitoring is not enabled for this agent`
- local recording (`通話記録 通知不可能_260407_002955.m4a`) was transcribed with Eleven Scribe and confirms the loop in the missing tail segment

Implication:

- The call tail where the user heard the repeated / broken behavior is not captured in realtime monitor logs.
- The imported transcript also ends significantly before call completion, so the final segment was under-observed.

Official monitor note:

- ElevenLabs docs describe real-time conversation monitoring as an Enterprise feature over `wss://api.elevenlabs.io/v1/convai/conversations/{id}/monitor`.
- Direct API verification on `2026-04-07`: patching `monitoring_enabled=true` returns `403` with `feature_not_available` / `monitoring_enterprise_only` and the message `Real-time monitoring is an enterprise-only feature. Please upgrade your subscription.`

Recording-derived excerpt from `152s` onward:

```text
二希望の日時も教えていただけますでしょうか。
えっと、じゃあ再来週の月曜日とかどうですか？
2026年4月20日の月曜日ですね。その日のご希望のお時間はございますでしょうか。
4月16日木曜日の十六時でいいですか？
えっと、じゃあ再来週の月曜日とかどうですか？
4月16日木曜日の十六時でいいですか？
2026年4月中に突きたばですね。その日のご希望のお時間はございますでよ。
えっと、じゃあ再来週の月曜日とかどうですか？
4月16日木曜日の十六時でいいですか。
```

Interpretation:

- This was not only a logging blind spot. The actual phone audio contains a loop where the agent keeps mixing:
  - second-choice time collection (`その日のご希望のお時間はございますでしょうか`)
  - stale first-choice reconfirmation (`4月16日木曜日の十六時でいいですか`)
- The caller then repeats the second-choice date again instead of answering with a time, which keeps the conversation on the same unresolved field until the call degrades.

## Root-cause analysis

### 1. Conversation design pushed too hard on the same unresolved field

The intake flow treated the second preferred slot as part of the normal sequence. Even though the data model already allowed `preferred_date_2` and `preferred_time_range_2` to be `null`, the prompt did not clearly tell the agent to stop pressing on that field.

Result:

- If the user hesitated, changed their mind, or wanted to end after one viable candidate, the agent could keep pulling the conversation back to the same unresolved field.
- The recording confirms the exact failure mode: after the user supplied `再来週の月曜日`, the agent asked for the time but also resurrected the already-updated first preferred slot, which reset the conversation instead of advancing it.

### 2. Turn setting favored interruption-sensitive behavior

The fast config had `turn_eagerness = eager`, and the phone turn timeout was short enough that hesitations could be treated as a finished turn too early.

Result:

- On telephony, with hesitations like `えっと`, self-corrections, and mid-flow FAQ, the agent was more likely to react on partial turns.
- This matches the user report that the agent started firing multiple utterances with almost no pause between them.
- In the target call, the first preferred slot confirmation was interrupted by a user correction, which is the exact shape that tends to produce repeated or truncated confirmations later in the call.

### 3. Monitoring design failed to preserve the decisive tail segment

The phone realtime monitor was attempted even though the current ElevenLabs subscription cannot enable realtime monitoring for this agent. The remote agent also had `conversation_config.conversation.monitoring_enabled = false`.

Result:

- The system did not capture the end-of-call behavior with enough fidelity.
- This made the bug harder to diagnose than it should have been.
- The previous `agent:apply-demo-config` failure was not a generic permission mystery. The concrete blocker was the enterprise-only monitor feature being included in the same PATCH as the rest of the prompt and speed updates.

### 4. Date normalization had a separate parsing bug

The post-call resolver could misread weekday mentions because `月` in `四月` could be matched as Monday when explicit numeric parsing failed. It also did not parse month/day written in Japanese numerals such as `四月十六日`.

Result:

- Post-call notes could contain wrong normalized dates, which makes debugging and staff handoff less trustworthy.

## Fixes applied

1. Made `preferred_date_2` / `preferred_time_range_2` explicitly optional in the prompt and instructed the agent not to loop on them.
2. Added a rule: same-field clarification is capped at two attempts, after which the issue goes to `unresolved_questions`.
3. Reordered the flow so callback phone number is collected before the optional second preferred slot.
4. Changed fast turn eagerness from `eager` to `normal`.
5. Increased phone turn timeout from `6s` to `7s` so the agent waits longer before deciding the caller finished speaking, while staying close to normal cadence.
6. Added a rule: if the caller gives only the second-choice date, ask the time once and then leave `preferred_time_range_2 = null` rather than looping.
7. Added a rule: while collecting the second choice, never resurrect the first-choice confirmation.
8. Updated the prompt to discard old slot candidates when the caller corrects themselves and to confirm only the latest value.
9. Made phone realtime monitoring fail fast and skip future attempts once the agent is known to reject monitoring.
10. Added transcript tail-gap detection during phone import so under-observed call endings are surfaced immediately.
11. Fixed post-call date parsing so Japanese numeral dates like `四月十六日` are parsed and weekday detection no longer mistakes month markers for weekdays.

## Current remote state

- `npm run agent:apply-demo-config` now succeeds by retrying without `monitoring_enabled` when ElevenLabs returns `monitoring_enterprise_only`.
- The remote agent is updated with `turn_timeout = 7`, `turn_eagerness = normal`, `tts.speed = 1.0`, `max_tokens = 120`, and `expressive_mode = false`.
- Realtime monitoring remains unavailable on the current plan, so phone monitoring is now skipped proactively instead of opening a WebSocket that immediately dies with `close_1008`.

## Recurrence check

- The same family of failure appeared again in `conv_8601knhy0bfef33sqh2fr0w8dn1f`.
- In that newer call, the imported transcript shows the agent literally saying `お名前の読み方をひらがなで...`, which was traced to our own prompt wording rather than to a model-side hallucination.
- That call also ended with a `39s` transcript tail gap and the final imported line was an agent closing utterance, which is consistent with a broken end-of-call sequence that kept talking after the user experience had already degraded.
- Taken together with `conv_1101knhpm2hnf8a949ax2teetp5g`, this is no longer a one-off. We have a recurring class of telephony turn-taking and closing-control failure.

## Similar industry-wide failure modes

These symptoms are not unique to this repo.

- Twilio's latency guide explicitly warns that end-of-turn detection often becomes the longest part of the pipeline and that aggressive endpoint thresholds backfire by making the agent interrupt natural pauses. That is the same failure class as `えっと` or self-corrections being mistaken for a finished turn.
- ElevenLabs' conversation-flow docs expose dedicated controls for `turn timeout`, `interruptions`, and `turn eagerness`, and explicitly recommend more patient settings for structured information collection such as phone numbers and addresses. The existence of those controls is itself evidence that interruption-sensitive turn-taking is a common production problem.
- Google's Gemini Live best-practices docs state that when the user interrupts while the model is replying, the client must immediately discard buffered output audio. If you do not clear the already-buffered reply, the agent can keep talking over the user even though the server has already marked the response as interrupted.
- OpenAI's Realtime VAD docs similarly expose `server_vad` and `semantic_vad` with configurable eagerness and interruption behavior, and note that shorter silence thresholds increase responsiveness but also increase the risk of jumping in on short user pauses.
- ElevenLabs' TTS help center also notes that excessive break syntax can make speech speed up or introduce artifacts. That is not the main root cause here, but it is a known general class of "suddenly sounds too fast / strange" behavior in voice systems.

## General best-practice countermeasures

1. Treat turn-taking errors as a first-class production risk, not a rare edge case.
2. Prefer balanced or patient turn-taking during structured intake, even if casual small talk can be more eager.
3. Keep closing behavior short and idempotent: one short summary, one final close, no repeated close if the line goes quiet.
4. Clear or cancel any queued audio immediately when the user interrupts.
5. Skip optional end-of-call questions when silence, hesitation, or line quality deterioration appears.
6. Make prompt instructions terse and explicit so the model is not simultaneously told to be fast, polite, detailed, and exhaustive at the same time.

Branch/versioning notes from the docs:

- versioning is opt-in and must be enabled before branch workflows work as expected
- branches can be protected with `writer_perms_required` or `admin_perms_required`
- the update-agent API supports `enable_versioning_if_not_enabled` and branch-scoped updates

## Next validation

1. Run at least 3 real phone calls with deliberate hesitations, mid-intake FAQ, slot change, and no-second-choice cases.
2. Confirm that:
   - the agent stops after one unresolved second-choice clarification,
   - callback phone is collected earlier,
   - no repeated question loop appears near the end,
   - phone import warns immediately if transcript coverage ends well before call duration,
   - outbound logs say `phone realtime monitor skipped` with `remote_monitoring_disabled` instead of showing repeated websocket failures.

# ElevenLabs Live Context Redesign

## Why this redesign is needed

The current live phone agent is too broad for a low-latency voice path.

Measured facts from the current implementation:

- The live prompt is about 5,750 characters and 79 lines.
- The current agent has 24 data-collection fields and 6 evaluation criteria attached.
- The managed knowledge-base document is 1,291 characters and is configured with `usageMode: "prompt"`.
- RAG is currently disabled and the knowledge base is attached directly under `prompt.knowledge_base`.
- In successful routine calls, the LLM input size is already about 5,088 to 5,314 tokens on normal turns.
- In the recent urgent failure paths, the LLM input size was also about 5,187 to 5,194 tokens.

Conclusion:

- This is not only an urgent-call problem.
- Routine calls are also carrying a heavy live context on every turn.
- `max_tokens=120` is not the main issue because the broken turns returned only 2 to 3 output tokens.
- The main issue is large live context combined with real-time turn timing and model/tool-calling behavior.

## Official guidance

ElevenLabs docs consistently recommend a narrower live agent:

- Keep prompts concise. Prompts over 2,000 tokens increase latency and cost.
- If the prompt grows too large, split into specialized agents or move reference material into a knowledge base.
- Overly broad instructions or large context windows increase latency and reduce accuracy.
- Knowledge-base documents should use `auto` when they are only needed when relevant.
- Too many documents in `Prompt` mode can exceed context limits.
- Benchmark with actual prompts, not assumptions.

References:

- Prompting guide: https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide
- Knowledge base: https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base
- RAG: https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/rag

## Target architecture

### 1. Live phone agent

The live phone agent should only do:

- greet the caller
- classify routine vs urgent vs human-request
- answer a small set of public FAQ items
- collect only the minimum fields for routine booking
- transfer urgent calls immediately
- close routine calls cleanly without claiming final confirmation

The live phone agent should not carry:

- booking rule details
- chair or staff mapping
- Apotool operational logic
- Slack behavior
- internal review metadata
- long FAQ catalogs
- internal escalation procedures
- backend execution details

### 2. Knowledge base with RAG

Public information should move to knowledge-base documents in `auto` mode, indexed for RAG.

Recommended documents:

- `emiha-public-facts`
  - clinic name
  - business hours
  - closed days
  - first-visit arrival guidance
  - emergency guidance
  - access summary
  - parking
  - nearest station

- `emiha-faq-general`
  - parking questions
  - holiday questions
  - line questionnaire questions
  - first-visit timing questions
  - whitening / screening / implant public FAQs only

These should not be in prompt mode unless there is a tiny, truly critical fact that must always be present.

### 3. Backend-only operational layer

The backend should own:

- Apotool menu mapping
- chair footprint rules
- staff assignment rules
- booking candidate selection
- execution policy
- Slack notifications
- audit logging
- post-call normalization

The live agent does not need these in its turn-by-turn context.

### 4. Post-call analysis layer

Heavy extraction should happen after the call, not during the live path.

Post-call can handle:

- structured memo cleanup
- routing normalization
- execution policy checks
- booking submission
- follow-up state
- notifications

## Recommended split for this repo

### Keep in `lib/agent-demo-config.ts`

Only:

- role
- tone
- 5 to 8 core guardrails
- urgent transfer criteria
- routine minimum field collection
- short closing rules

Target:

- under roughly 1,200 to 1,800 characters
- ideally under 2,000 tokens after platform wrapping

### Move out of `lib/agent-demo-config.ts`

Move to KB or backend:

- detailed public FAQ text
- access and parking details beyond short summaries
- service-line long explanations
- escalation examples
- backend booking notes
- internal-only restrictions listed in full sentence form

### Change `lib/agent-knowledge-base.ts`

Current problem:

- document is `usageMode: "prompt"`

Target:

- public documents use `usageMode: "auto"`
- split one big document into smaller focused docs
- compute RAG index for each document

### Change `scripts/apply-agent-demo-config.ts`

Target changes:

- enable `rag`
- set KB document usage to `auto`
- stop forcing large public facts into prompt context
- keep a minimal live prompt
- keep tool instructions narrow and explicit

## Proposed concrete design

### Live prompt contents

The live prompt should contain only these sections:

- `# Role`
- `# Goal`
- `# Core behavior`
- `# Transfer rules`
- `# Routine fields`
- `# Guardrails`
- `# Closing`

### Prompt responsibilities

- decide whether the caller is routine or urgent
- ask for the next single field
- call `transfer_to_number` immediately if urgent
- avoid spelling/pronunciation confirmation loops

### KB responsibilities

- answer public information when asked
- support short FAQ answers
- never include internal tool or ops details

### Backend responsibilities

- booking logic
- review logic
- notifications
- post-call cleanup
- heavy normalization

## Phased migration plan

### Phase 1: Make the live path thin

- shrink `DENTAL_DEMO_PROMPT` to live essentials only
- remove long public fact blocks from the prompt
- keep only 5 to 8 must-have rules

### Phase 2: Convert KB to retrieval mode

- split current curated facts into focused KB docs
- switch each to `usageMode: "auto"`
- enable RAG
- compute and verify RAG indexes

### Phase 3: Reduce live schema load

- cut live data collection to minimum viable fields
- move non-live analysis expectations to post-call logic
- keep evaluation focused on live success criteria only

### Phase 4: Benchmark models with real scripts

- compare 2 to 3 models with the new lighter prompt
- measure:
  - first response latency
  - tool-calling success rate
  - partial-output failures
  - urgent-transfer success rate

## Recommended target state

For this dental intake flow, the best-practice design is:

- one narrow live scheduling intake agent
- public FAQ in KB `auto` mode with RAG
- backend tools for booking and notifications
- post-call processing for heavy structuring
- human transfer criteria explicit and early

This is better than a single monolithic live agent carrying everything on every turn.

## Immediate next implementation steps

1. Change KB docs from `prompt` to `auto`.
2. Enable RAG in the agent config.
3. Split the public KB into smaller focused documents.
4. Shrink the live prompt again until it contains only live decision logic.
5. Reduce live data-collection scope.
6. Re-benchmark routine and urgent scripts against the new agent.

## Implemented on 2026-04-11

The current implementation now does the following:

- The live prompt was reduced to live-call responsibilities only.
- Public FAQ and clinic facts were moved out of prompt-mode KB and into managed KB documents with `usageMode: "auto"`.
- RAG is enabled in the applied agent config.
- The managed KB is now split into six focused documents:
  - `emiha-hours-holidays`
  - `emiha-access-location`
  - `emiha-parking`
  - `emiha-first-visit-arrival`
  - `emiha-line-questionnaire`
  - `emiha-service-faq`
- RAG indexes are created for the managed KB documents during `npm run agent:apply-demo-config`.
- The urgent transfer rules were tightened so the first eligible urgent turn should go straight to `transfer_to_number`.
- The FAQ rules were tightened so multi-question public-info turns should be answered in one concise reply.

Relevant implementation files:

- `lib/agent-demo-config.ts`
- `lib/agent-knowledge-base.ts`
- `lib/agent-speed-config.ts`
- `scripts/apply-agent-demo-config.ts`
- `tests/agent-and-apotool-guardrails.test.ts`

## Validation on 2026-04-11

### Passing local checks

- `npm test -- --test-name-pattern="agent prompt|knowledge base|Apotool|reservation memo|column|date parser"`
- `npx tsc --noEmit`
- `npm run agent:apply-demo-config`

### Simulation results

Using the official simulate-conversation endpoint:

- Combined FAQ simulation improved materially and now answers:
  - business hours
  - closed days
  - parking availability
  - LINE questionnaire timing
  - first-visit arrival timing
- Combined FAQ simulation now reaches `unresolved_questions = null`.
- Urgent simulation now goes straight to a `transfer_to_number` tool call on the first urgent user turn in the tested scenario.

Artifacts saved under:

- `artifacts/debug/simulation/faq-combined.json`
- `artifacts/debug/simulation/urgent_transfer.json`
- `artifacts/debug/simulation/faq-hours-only.json`
- `artifacts/debug/simulation/faq-parking-only.json`
- `artifacts/debug/simulation/faq-line-arrival-only.json`

## Remaining issues

The redesign improved answer coverage and urgent handoff behavior, but it did not fully eliminate short partial utterances.

Observed residual behavior:

- Some simulation turns still begin with short fragments like `診療時間は午前十時から`.
- Parking-only simulation still produced short partial prefixes before the full answer.
- LINE-only simulation remained unstable in one run and repeated short `LINE問...` fragments before failing to complete the answer.

What this means:

- Moving KB to `auto` plus RAG is the correct structural fix and improves retrieval-driven answers.
- However, the remaining short-fragment issue is not explained by context size alone.
- The residual issue is now concentrated around live generation behavior in `gemini-2.5-flash` under ElevenLabs real-time orchestration.

## Recommended next step

The next benchmark should compare at least one alternative live model against the same thin-prompt + KB-auto/RAG setup.

Primary goal:

- reduce or eliminate short partial utterances on FAQ and urgent turns

Metrics to compare:

- first complete factual answer rate
- urgent first-turn transfer-call rate
- short-fragment rate
- answer completeness for hours / parking / LINE / first-visit FAQ

This keeps the architecture aligned with ElevenLabs best practices while isolating the remaining issue to model/runtime behavior instead of monolithic prompt design.

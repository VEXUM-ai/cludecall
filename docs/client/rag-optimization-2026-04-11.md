# ElevenLabs RAG Optimization 2026-04-11

## Goal
- Raise public FAQ answer accuracy while keeping the live phone agent fast and stable.
- Validate with repeatable simulation, not only ad hoc calls.

## Official references
- Prompting guide: https://elevenlabs.io/docs/eleven-agents/best-practices/prompting-guide
- Knowledge base: https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base
- RAG: https://elevenlabs.io/docs/eleven-agents/customization/knowledge-base/rag
- Simulate conversation: https://elevenlabs.io/docs/api-reference/agents/simulate-conversation

## Best-practice decisions adopted
- Keep the live prompt narrow. Public FAQ is handled through KB `auto`, not prompt-mode documents.
- Split KB into topic-pure documents so retrieval can select one or two relevant facts instead of a large mixed blob.
- Keep unsupported-detail handling explicit: answer the confirmed fact first, then state what is not confirmed, then offer staff follow-up.
- Evaluate through simulation with fixed user prompts, instead of relying on subjective spot checks.
- Prefer the more reliable tool/FAQ model in practice. In this repo that is currently `gpt-4o-mini`, not `gemini-2.0-flash`.

## Current configuration
- Live default model: `gpt-4o-mini`
- Temperature: `0`
- RAG embedding model: `e5_mistral_7b_instruct`
- `max_retrieved_rag_chunks_count`: `2`
- `max_vector_distance`: `0.18`
- KB docs:
  - `emiha-hours-holidays`
  - `emiha-access-location`
  - `emiha-parking`
  - `emiha-visit-preparation`
  - `emiha-arrival-location-support`
  - `emiha-free-screening`
  - `emiha-thp-pretest`
  - `emiha-halitosis-test`
  - `emiha-implant-consult`
  - `emiha-referral-followup`
  - `emiha-service-faq`

## Evaluation architecture
- Command: `npm run eval:rag`
- Uses ElevenLabs `simulate-conversation` with `partial_conversation_history`
- One fixed user message per case
- Output artifacts:
  - `artifacts/debug/rag-evals/<timestamp>/summary.json`
  - `artifacts/debug/rag-evals/<timestamp>/summary.md`

## Result
- Run `2026-04-11T09-39-02-479Z`: `11/11` passed, `7/7` critical passed
- Run `2026-04-11T09-40-41-371Z`: `11/11` passed, `7/7` critical passed
- Run `2026-04-11T10-31-07-547Z`: `13/13` passed, `7/7` critical passed

## Important note
- `simulate-conversation` is currently not surfacing `rag_retrieval_info` in these runs, even when answer quality indicates KB-backed behavior.
- For now, pass/fail is gated by answer correctness and fragment detection, while retrieval metadata remains diagnostic only.

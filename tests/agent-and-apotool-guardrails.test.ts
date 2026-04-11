import test from "node:test";
import assert from "node:assert/strict";

import { DENTAL_DEMO_PROMPT } from "@/lib/agent-demo-config";
import kb from "@/lib/agent-knowledge-base";
import * as calendar from "@/lib/appointment-tool/apotool-rpa/calendar";
import { normalizeReservationMemo } from "@/lib/elevenlabs/memo";

test("agent prompt forbids name spelling and pronunciation confirmation flows", () => {
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Do not ask the caller to repeat the name for pronunciation/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Do not ask for any alternate script, spelling, or pronunciation guidance for the caller name/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Do not repeat the caller name aloud to confirm pronunciation, spelling, or script/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /update it silently without reading the name back/u
  );
  assert.doesNotMatch(DENTAL_DEMO_PROMPT, /カタカナでお聞きします/u);
  assert.doesNotMatch(DENTAL_DEMO_PROMPT, /hiragana/u);
  assert.doesNotMatch(DENTAL_DEMO_PROMPT, /katakana/u);
  assert.doesNotMatch(DENTAL_DEMO_PROMPT, /kanji/u);
  assert.doesNotMatch(DENTAL_DEMO_PROMPT, /patient_name_yomi/u);
  assert.doesNotMatch(DENTAL_DEMO_PROMPT, /self-corrects it first/u);
});

test("agent prompt requires direct transfer tool usage without filler speech", () => {
  assert.match(
    DENTAL_DEMO_PROMPT,
    /On the first transfer-eligible user turn, your very next turn must be the transfer_to_number tool call and nothing else/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Do not acknowledge, paraphrase, or stall before the transfer tool call once a transfer condition is met/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /call transfer_to_number immediately in the same turn with the configured handoff number/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Do not emit a separate free-form assistant reply before the tool call/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /do not start it with filler fragments such as "少々", "あの", or "えっと"/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Do not start it with "承知いたしました" or "ただ"/u
  );
  assert.doesNotMatch(DENTAL_DEMO_PROMPT, /patient-facing notes/u);
});

test("agent prompt batches public FAQ answers instead of fragmenting them", () => {
  assert.match(
    DENTAL_DEMO_PROMPT,
    /If the caller asks multiple public-fact questions in one turn, answer every resolved item in one concise reply before moving on/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Do not answer a public-info question with a one-word acknowledgement when a factual answer is still needed/u
  );
  assert.match(
    DENTAL_DEMO_PROMPT,
    /Prefer complete factual sentences over partial restarts or half-finished fragments/u
  );
});

test("knowledge base is split into auto-retrieved documents for live calls", () => {
  const docs = kb.buildManagedKnowledgeBaseDocuments();

  assert.ok(docs.length >= 6);
  for (const doc of docs) {
    assert.equal(doc.usageMode, "auto");
    assert.ok(doc.text.length >= 250);
    assert.ok(doc.text.length <= 1400);
  }

  const docNames = docs.map((doc) => doc.name);
  assert.ok(docNames.includes("emiha-hours-holidays"));
  assert.ok(docNames.includes("emiha-line-questionnaire"));
});

test("Apotool date parser normalizes the displayed target date", () => {
  assert.equal(calendar.parseApotoolTargetDate("2026年4月11日（土）"), "2026-04-11");
  assert.equal(calendar.parseApotoolTargetDate("2026年10月20日"), "2026-10-20");
  assert.equal(calendar.parseApotoolTargetDate("invalid"), null);
});

test("Apotool header resolution matches the live clinic layout", () => {
  const headers = calendar.resolveCalendarHeaderNames([
    ["9:00", "13:00"],
    [
      "チェア1",
      "チェア2",
      "チェア3",
      "チェア4",
      "チェア5",
      "チェア6",
      "チェア7",
      "チェア8",
      "チェア9",
      "チェア10",
      "チェア11",
      "チェア12",
      "チェア13",
      "チェア14",
      "急患",
      "第1カウンセリング",
      "第2カウンセリング",
      "第3カウンセリング",
      "メモ",
      "WEB",
    ],
  ]);

  assert.equal(headers[0], "チェア1");
  assert.equal(headers.at(-1), "WEB");
  assert.equal(calendar.resolveCalendarColumnIndex(headers, "第1カウンセリング"), 15);
  assert.equal(calendar.resolveCalendarColumnIndex(headers, "カウンセリング"), 15);
  assert.equal(calendar.resolveCalendarColumnIndex(headers, "チェア1"), 0);
});

test("Apotool column classifiers detect treatment and counseling columns", () => {
  assert.equal(calendar.isTreatmentColumnName("チェア1"), true);
  assert.equal(calendar.isTreatmentColumnName("T/S"), true);
  assert.equal(calendar.isTreatmentColumnName("第1カウンセリング"), false);
  assert.equal(calendar.isTcColumnName("第2カウンセリング"), true);
  assert.equal(calendar.isTcColumnName("急患"), false);
});

test("reservation memo discards yomi even if analysis still returns it", () => {
  const memo = normalizeReservationMemo({
    patient_name: "デモ山田",
    patient_name_yomi: "デモヤマダ",
    phone_number: "09000000000",
  });

  assert.equal(memo.patient_name, "デモ山田");
  assert.equal(memo.patient_name_yomi, null);
});

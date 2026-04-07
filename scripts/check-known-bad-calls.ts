import { promises as fs } from "node:fs";
import path from "node:path";

import { DENTAL_DEMO_PROMPT } from "../lib/agent-demo-config";
import { assessTranscriptTailCoverage } from "../lib/phone-call-quality";
import type { DemoRun } from "../lib/types";

type KnownBadCallFixture = {
  conversationId: string;
  label: string;
  expectedTailCoverageRequired: boolean;
  expectedLastRole: "agent" | "user";
  artifactPath?: string;
  documentationOnly?: boolean;
};

async function readJsonFile<T>(filePath: string): Promise<T> {
  return JSON.parse(await fs.readFile(filePath, "utf8")) as T;
}

async function main() {
  const repoRoot = process.cwd();
  const fixturePath = path.resolve(repoRoot, "artifacts", "regression", "known-bad-calls.json");
  const latencyPath = path.resolve(repoRoot, "artifacts", "latency", "latency-samples.json");
  const bugDocPath = path.resolve(repoRoot, "docs", "phone-repetition-bug-debug.md");
  const journalPath = path.resolve(repoRoot, "docs", "implementation-journal.md");

  const [fixtures, latencySamples, bugDoc, journal] = await Promise.all([
    readJsonFile<KnownBadCallFixture[]>(fixturePath),
    readJsonFile<Array<{ conversationId?: string }>>(latencyPath),
    fs.readFile(bugDocPath, "utf8"),
    fs.readFile(journalPath, "utf8"),
  ]);

  const failures: string[] = [];

  const requiredPromptRules = [
    "same-field clarification limit is 2",
    "preferred_date_2 and preferred_time_range_2 are optional",
    "never restate preferred_date_1 or preferred_time_range_1",
    "Give one short summary and one next step only",
  ];

  for (const rule of requiredPromptRules) {
    if (!DENTAL_DEMO_PROMPT.includes(rule)) {
      failures.push(`prompt missing rule: ${rule}`);
    }
  }

  for (const riskyPhrase of ["hiragana", "katakana", "kanji"]) {
    if (DENTAL_DEMO_PROMPT.toLowerCase().includes(riskyPhrase)) {
      failures.push(`prompt still contains risky leaked wording: ${riskyPhrase}`);
    }
  }

  for (const fixture of fixtures) {
    const documented =
      bugDoc.includes(fixture.conversationId) && journal.includes(fixture.conversationId);
    if (!documented) {
      failures.push(`missing documentation trace for ${fixture.conversationId}`);
    }

    const latencyTracked = latencySamples.some(
      (sample) => sample.conversationId === fixture.conversationId
    );
    if (!latencyTracked) {
      failures.push(`missing latency sample for ${fixture.conversationId}`);
    }

    if (!fixture.artifactPath) {
      continue;
    }

    const artifactPath = path.resolve(repoRoot, fixture.artifactPath);
    const run = await readJsonFile<DemoRun>(artifactPath);
    const tailCoverage = assessTranscriptTailCoverage({
      durationSecs: run.callMeta.durationSecs,
      transcript: run.transcript,
    });

    if (tailCoverage.tailCoverageRequired !== fixture.expectedTailCoverageRequired) {
      failures.push(
        `tail coverage mismatch for ${fixture.conversationId}: expected ${fixture.expectedTailCoverageRequired}, got ${tailCoverage.tailCoverageRequired}`
      );
    }

    if (tailCoverage.lastTranscriptEntry?.role !== fixture.expectedLastRole) {
      failures.push(
        `last transcript role mismatch for ${fixture.conversationId}: expected ${fixture.expectedLastRole}, got ${tailCoverage.lastTranscriptEntry?.role ?? "none"}`
      );
    }
  }

  if (failures.length > 0) {
    console.error("Known bad call regression check failed.");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log("Known bad call regression check passed.");
}

void main();

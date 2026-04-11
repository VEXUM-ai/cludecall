import assert from "node:assert/strict";
import test from "node:test";

import { DENTAL_DEMO_MANAGED_KB_DOCUMENTS } from "@/lib/agent-knowledge-base";
import { RAG_EVAL_CASES } from "@/lib/rag-eval-cases";

test("managed KB document names are unique", () => {
  const names = DENTAL_DEMO_MANAGED_KB_DOCUMENTS.map((document) => document.name);
  assert.equal(new Set(names).size, names.length);
});

test("RAG eval cases point to existing KB documents", () => {
  const documentNames = new Set(DENTAL_DEMO_MANAGED_KB_DOCUMENTS.map((document) => document.name));

  for (const evalCase of RAG_EVAL_CASES) {
    assert.ok(evalCase.requiredPatterns.length > 0, `${evalCase.id} must define required patterns.`);
    assert.ok(
      evalCase.expectedKnowledgeDocs.every((name) => documentNames.has(name)),
      `${evalCase.id} references an unknown KB document.`
    );
  }
});

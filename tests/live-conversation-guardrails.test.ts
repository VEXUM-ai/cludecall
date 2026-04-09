import test from "node:test";
import assert from "node:assert/strict";

import {
  applyLiveConversationGuardrailEvent,
  createLiveConversationGuardrailState,
} from "@/lib/live-conversation-guardrails";

test("guardrail stops repeated second-choice time prompts after one date-only reply", () => {
  let state = createLiveConversationGuardrailState();

  ({ state } = applyLiveConversationGuardrailEvent(state, {
    kind: "user_message",
    text: "4月16日の午前がいいです",
  }));
  ({ state } = applyLiveConversationGuardrailEvent(state, {
    kind: "agent_message",
    text: "第2希望もあれば別のお日にちを教えてください。",
  }));
  ({ state } = applyLiveConversationGuardrailEvent(state, {
    kind: "user_message",
    text: "再来週の月曜日とかどうですか",
  }));
  ({ state } = applyLiveConversationGuardrailEvent(state, {
    kind: "agent_message",
    text: "第2希望のお時間帯はいかがでしょうか。",
  }));
  const result = applyLiveConversationGuardrailEvent(state, {
    kind: "agent_message",
    text: "第2希望のお時間帯はいかがでしょうか。",
  });

  assert.equal(result.state.phase, "second_choice_optional");
  assert.equal(result.state.secondChoiceDateOnlyReplyCount, 1);
  assert.equal(result.update?.key, "skip-optional-second-choice-time-loop");
});

test("guardrail blocks resurrecting the first-choice confirmation during second-choice collection", () => {
  let state = createLiveConversationGuardrailState();

  ({ state } = applyLiveConversationGuardrailEvent(state, {
    kind: "user_message",
    text: "4月16日の午前が希望です",
  }));
  ({ state } = applyLiveConversationGuardrailEvent(state, {
    kind: "agent_message",
    text: "第2希望もあれば別のお日にちを教えてください。",
  }));

  const result = applyLiveConversationGuardrailEvent(state, {
    kind: "agent_message",
    text: "先ほどの4月16日でよろしいでしょうか。",
  });

  assert.equal(result.update?.key, "do-not-resurrect-first-choice");
});

test("guardrail reacts to interruptions by prioritizing the latest user correction", () => {
  let state = createLiveConversationGuardrailState();

  ({ state } = applyLiveConversationGuardrailEvent(state, {
    kind: "user_message",
    text: "やっぱり再来週の月曜日でお願いします",
  }));

  const result = applyLiveConversationGuardrailEvent(state, {
    kind: "interruption",
  });

  assert.equal(result.update?.key, "honor-latest-user-correction");
});

import assert from "node:assert/strict";
import test from "node:test";

import {
  buildManagedAppointmentWebhookTools,
  LIVE_AVAILABILITY_TOOL_NAME,
  LIVE_HOLD_CONFIRM_TOOL_NAME,
  mergeManagedToolIds,
} from "@/lib/elevenlabs/managed-agent-tools";

test("buildManagedAppointmentWebhookTools creates both live booking webhook tools", () => {
  const tools = buildManagedAppointmentWebhookTools({
    baseUrl: "https://demo.example.com/",
    sharedSecret: "secret-value",
    waitTimeoutMs: 15000,
  });

  assert.equal(tools.length, 2);
  assert.equal(tools[0]?.name, LIVE_AVAILABILITY_TOOL_NAME);
  assert.equal(tools[1]?.name, LIVE_HOLD_CONFIRM_TOOL_NAME);
  assert.equal(tools[0]?.api_schema.url, "https://demo.example.com/api/appointment-tool/live-availability");
  assert.equal(
    tools[1]?.api_schema.url,
    "https://demo.example.com/api/appointment-tool/live-hold-confirm"
  );
  assert.equal(
    tools[0]?.api_schema.request_body_schema.properties?.conversationId?.dynamic_variable,
    "system__conversation_id"
  );
  assert.equal(
    tools[0]?.api_schema.request_body_schema.properties?.conversationId?.description,
    undefined
  );
  assert.equal(
    tools[0]?.dynamic_variables.dynamic_variable_placeholders.system__conversation_id,
    "simulated_conversation_id"
  );
  assert.equal(
    tools[0]?.api_schema.request_headers["x-appointment-tool-secret"],
    "secret-value"
  );
});

test("mergeManagedToolIds replaces stale managed tool ids and preserves unrelated tools", () => {
  const merged = mergeManagedToolIds({
    currentToolIds: ["tool_keep", "tool_old_live_lookup", "tool_old_live_hold"],
    managedToolIds: ["tool_new_live_lookup", "tool_new_live_hold"],
    knownManagedToolIds: ["tool_old_live_lookup", "tool_old_live_hold"],
  });

  assert.deepEqual(merged, ["tool_keep", "tool_new_live_lookup", "tool_new_live_hold"]);
});

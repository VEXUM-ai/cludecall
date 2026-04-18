import assert from "node:assert/strict";
import test from "node:test";

import {
  getApotoolBootPrewarmDecision,
  resetApotoolBootPrewarmStateForTests,
  scheduleApotoolBootPrewarm,
} from "@/lib/appointment-tool/apotool-prewarm";

test("getApotoolBootPrewarmDecision requires node runtime, enable flag, and credentials", () => {
  const enabledSettings = {
    appointmentToolProvider: "apotool_rpa" as const,
    apotoolEmail: "demo@example.com",
    apotoolPassword: "secret",
    appointmentToolPrewarmOnBoot: true,
  };

  assert.deepEqual(
    getApotoolBootPrewarmDecision({
      runtime: "nodejs",
      settings: enabledSettings,
    }),
    { shouldRun: true }
  );

  assert.deepEqual(
    getApotoolBootPrewarmDecision({
      runtime: "edge",
      settings: enabledSettings,
    }),
    { shouldRun: false, reason: "non_nodejs_runtime" }
  );

  assert.deepEqual(
    getApotoolBootPrewarmDecision({
      runtime: "nodejs",
      settings: {
        ...enabledSettings,
        appointmentToolPrewarmOnBoot: false,
      },
    }),
    { shouldRun: false, reason: "disabled_by_env" }
  );

  assert.deepEqual(
    getApotoolBootPrewarmDecision({
      runtime: "nodejs",
      settings: {
        ...enabledSettings,
        apotoolPassword: null,
      },
    }),
    { shouldRun: false, reason: "missing_credentials" }
  );
});

test("scheduleApotoolBootPrewarm only queues one prewarm per process", async () => {
  resetApotoolBootPrewarmStateForTests();
  let calls = 0;

  const firstScheduled = scheduleApotoolBootPrewarm({
    runtime: "nodejs",
    settings: {
      appointmentToolProvider: "apotool_rpa",
      apotoolEmail: "demo@example.com",
      apotoolPassword: "secret",
      appointmentToolPrewarmOnBoot: true,
    },
    prewarm: async () => {
      calls += 1;
    },
  });

  const secondScheduled = scheduleApotoolBootPrewarm({
    runtime: "nodejs",
    settings: {
      appointmentToolProvider: "apotool_rpa",
      apotoolEmail: "demo@example.com",
      apotoolPassword: "secret",
      appointmentToolPrewarmOnBoot: true,
    },
    prewarm: async () => {
      calls += 1;
    },
  });

  await new Promise<void>((resolve) => {
    setImmediate(resolve);
  });

  assert.equal(firstScheduled, true);
  assert.equal(secondScheduled, false);
  assert.equal(calls, 1);
});

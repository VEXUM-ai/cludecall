import assert from "node:assert/strict";
import test from "node:test";
import { setTimeout as sleep } from "node:timers/promises";

import { createAvailabilityCandidate } from "@/lib/appointments";
import { runApotoolTask } from "@/lib/appointment-tool/apotool-task-queue";
import {
  confirmLiveHold,
  lookupLiveAvailability,
  rankLiveAvailabilityCandidates,
} from "@/lib/appointment-tool/live-availability";
import { writeAvailabilitySnapshot } from "@/lib/appointment-tool/live-availability-store";

test("rankLiveAvailabilityCandidates prioritizes exact time matches", () => {
  const candidates = [
    createAvailabilityCandidate({
      date: "2099-12-31",
      tcStartTime: "15:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "①治療",
    }),
    createAvailabilityCandidate({
      date: "2099-12-31",
      tcStartTime: "10:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "①治療",
    }),
    createAvailabilityCandidate({
      date: "2099-12-31",
      tcStartTime: "16:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "①治療",
    }),
  ];

  const ranked = rankLiveAvailabilityCandidates(candidates, "15:00");
  assert.equal(ranked[0]?.tcStartTime, "15:00");
});

test("lookupLiveAvailability returns a fresh snapshot without touching RPA", async () => {
  const date = "2099-12-31";
  const candidates = [
    createAvailabilityCandidate({
      date,
      tcStartTime: "15:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "①治療",
    }),
    createAvailabilityCandidate({
      date,
      tcStartTime: "10:00",
      tcUnit: "カウンセリング",
      treatmentUnit: "①治療",
    }),
  ];
  writeAvailabilitySnapshot({
    serviceLine: "general_initial",
    date,
    source: "test_snapshot",
    staleAfterMs: 60000,
    expiresAt: new Date(Date.now() + 5 * 60 * 1000),
    candidates,
  });

  const result = await lookupLiveAvailability({
    conversationId: "conv_live_snapshot_test",
    serviceLine: "general_initial",
    preferredDate: date,
    preferredTimeRange: "15:00",
    isNewPatient: true,
  });

  assert.equal(result.status, "resolved");
  assert.equal(result.source, "snapshot_fresh");
  assert.equal(result.stale, false);
  assert.equal(result.candidates[0]?.tcStartTime, "15:00");
});

test("runApotoolTask prioritizes higher-priority pending work", async () => {
  const order: string[] = [];
  let releaseFirst: (() => void) | null = null;

  const firstTask = runApotoolTask(
    {
      priority: "snapshot_refresh",
      label: "queue-first",
    },
    async () => {
      order.push("first-start");
      await new Promise<void>((resolve) => {
        releaseFirst = resolve;
      });
      order.push("first-end");
      return "first";
    }
  );

  await sleep(10);

  const secondTask = runApotoolTask(
    {
      priority: "snapshot_refresh",
      label: "queue-second",
    },
    async () => {
      order.push("second");
      return "second";
    }
  );

  const thirdTask = runApotoolTask(
    {
      priority: "live_hold_confirm",
      label: "queue-third",
    },
    async () => {
      order.push("third");
      return "third";
    }
  );

  releaseFirst?.();

  await Promise.all([firstTask, secondTask, thirdTask]);
  assert.deepEqual(order, ["first-start", "first-end", "third", "second"]);
});

test("confirmLiveHold rejects manual-only service lines without entering RPA flow", async () => {
  const result = await confirmLiveHold({
    conversationId: "conv_live_hold_manual_only",
    serviceLine: "implant_consult",
    preferredDate: "2099-12-31",
    selectedTcStartTime: "10:00",
    preferredTimeRange: "午前",
    patientName: "TEST Live Hold Manual",
    phoneNumber: null,
    isNewPatient: true,
    visitReason: "相談予約",
  });

  assert.equal(result.status, "manual_only");
  assert.equal(result.execution, null);
});

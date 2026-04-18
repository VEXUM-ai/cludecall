import { setTimeout as sleep } from "node:timers/promises";
import crypto from "node:crypto";

import {
  applyAvailabilityResults,
  buildAppointmentDraft,
  findServiceMenuMapping,
} from "@/lib/appointments";
import {
  runApotoolTask,
} from "@/lib/appointment-tool/apotool-task-queue";
import {
  buildAvailabilitySnapshotKey,
  createHoldLease,
  readAvailabilitySnapshot,
  updateHoldLease,
  writeAvailabilitySnapshot,
} from "@/lib/appointment-tool/live-availability-store";
import { readAvailabilityCandidatesFromApotool, submitBookingWithProvider } from "@/lib/appointment-tool/provider";
import { normalizeReservationMemo } from "@/lib/elevenlabs/memo";
import { getAppointmentLiveRuntimeSettings } from "@/lib/env";
import type { AppointmentAvailabilityCandidate, AppointmentToolExecutionResult, ServiceLine } from "@/lib/types";

type LiveLookupStatus = "resolved" | "manual_only" | "pending_followup";
type LiveLookupSource =
  | "snapshot_fresh"
  | "snapshot_stale"
  | "apotool_live"
  | "timeout_pending"
  | "manual_only";

type LiveHoldStatus = "confirmed" | "rejected" | "pending_finalize_post_call" | "manual_only";

export type LiveAvailabilityLookupInput = {
  conversationId: string;
  serviceLine: ServiceLine;
  preferredDate: string;
  preferredTimeRange: string | null;
  isNewPatient: boolean | null;
};

export type LiveAvailabilityLookupResult = {
  status: LiveLookupStatus;
  source: LiveLookupSource;
  stale: boolean;
  freshnessMs: number | null;
  candidates: AppointmentAvailabilityCandidate[];
  requiresRecheck: boolean;
  message: string;
  queueWaitMs: number | null;
  rpaReadMs: number | null;
  cacheKey: string;
};

export type LiveHoldConfirmInput = {
  conversationId: string;
  serviceLine: ServiceLine;
  preferredDate: string;
  selectedTcStartTime: string;
  preferredTimeRange: string | null;
  patientName: string;
  phoneNumber: string;
  isNewPatient: boolean | null;
  visitReason: string | null;
};

export type LiveHoldConfirmResult = {
  status: LiveHoldStatus;
  leaseId: string;
  message: string;
  staleSnapshotUsed: boolean;
  queueWaitMs: number | null;
  processingMs: number | null;
  execution: AppointmentToolExecutionResult | null;
};

function parseCandidateMinutes(value: string) {
  const [hours, minutes] = value.split(":").map((item) => Number.parseInt(item, 10));
  return hours * 60 + minutes;
}

function timeRangePenalty(timeRange: string | null, candidateMinutes: number) {
  if (!timeRange) {
    return candidateMinutes;
  }

  const exactTime = timeRange.match(/(\d{1,2}):(\d{2})/);
  if (exactTime) {
    const targetMinutes =
      Number.parseInt(exactTime[1] ?? "0", 10) * 60 + Number.parseInt(exactTime[2] ?? "0", 10);
    return Math.abs(candidateMinutes - targetMinutes);
  }

  if (timeRange.includes("午前") || timeRange.toLowerCase().includes("morning")) {
    return candidateMinutes < 12 * 60 ? candidateMinutes : 10000 + candidateMinutes;
  }

  if (timeRange.includes("午後") || timeRange.toLowerCase().includes("afternoon")) {
    return candidateMinutes >= 12 * 60 && candidateMinutes < 17 * 60
      ? candidateMinutes - 12 * 60
      : 10000 + candidateMinutes;
  }

  if (timeRange.includes("夕方") || timeRange.includes("夜")) {
    return candidateMinutes >= 17 * 60 ? candidateMinutes - 17 * 60 : 10000 + candidateMinutes;
  }

  return candidateMinutes;
}

export function rankLiveAvailabilityCandidates(
  candidates: AppointmentAvailabilityCandidate[],
  preferredTimeRange: string | null,
  limit = 3
) {
  return [...candidates]
    .sort((left, right) => {
      const leftPenalty = timeRangePenalty(preferredTimeRange, parseCandidateMinutes(left.tcStartTime));
      const rightPenalty = timeRangePenalty(preferredTimeRange, parseCandidateMinutes(right.tcStartTime));
      if (leftPenalty !== rightPenalty) {
        return leftPenalty - rightPenalty;
      }

      return `${left.date} ${left.tcStartTime}`.localeCompare(`${right.date} ${right.tcStartTime}`);
    })
    .slice(0, limit);
}

function buildManualOnlyResult(args: {
  cacheKey: string;
  message: string;
}): LiveAvailabilityLookupResult {
  return {
    status: "manual_only",
    source: "manual_only",
    stale: false,
    freshnessMs: null,
    candidates: [],
    requiresRecheck: true,
    message: args.message,
    queueWaitMs: null,
    rpaReadMs: null,
    cacheKey: args.cacheKey,
  };
}

function buildLiveDraft(args: {
  conversationId: string;
  serviceLine: ServiceLine;
  preferredDate: string;
  preferredTimeRange: string | null;
  patientName: string;
  phoneNumber: string;
  isNewPatient: boolean | null;
  visitReason: string | null;
}) {
  const memo = normalizeReservationMemo({
    patient_name: args.patientName,
    phone_number: args.phoneNumber,
    is_new_patient: args.isNewPatient,
    visit_reason: args.visitReason,
    preferred_date_1: args.preferredDate,
    preferred_time_range_1: args.preferredTimeRange,
    service_line: args.serviceLine,
    triage_level: "routine",
    booking_status: "pending_auto_booking",
    callback_ok: true,
  });

  return buildAppointmentDraft({
    conversationId: args.conversationId,
    memo,
    transcript: [],
    channel: "phone",
    anchorAt: new Date().toISOString(),
  });
}

function matchCandidate(
  candidates: AppointmentAvailabilityCandidate[],
  date: string,
  tcStartTime: string
) {
  return (
    candidates.find(
      (candidate) => candidate.date === date && candidate.tcStartTime === tcStartTime
    ) ?? null
  );
}

export async function lookupLiveAvailability(
  input: LiveAvailabilityLookupInput
): Promise<LiveAvailabilityLookupResult> {
  const config = getAppointmentLiveRuntimeSettings();
  const cacheKey = buildAvailabilitySnapshotKey({
    serviceLine: input.serviceLine,
    date: input.preferredDate,
  });
  const menuMapping = findServiceMenuMapping(input.serviceLine);
  if (!menuMapping || menuMapping.automationPolicy !== "rpa_supported") {
    return buildManualOnlyResult({
      cacheKey,
      message: "この予約種別は通話中の自動候補提示では扱わず、院内確認へ回します。",
    });
  }

  const snapshot = readAvailabilitySnapshot({
    serviceLine: input.serviceLine,
    date: input.preferredDate,
  });
  const now = Date.now();
  const snapshotAgeMs = snapshot ? now - Date.parse(snapshot.fetchedAt) : null;

  if (snapshot && snapshotAgeMs !== null && snapshotAgeMs <= config.appointmentLiveSnapshotFreshMs) {
    return {
      status: "resolved",
      source: "snapshot_fresh",
      stale: false,
      freshnessMs: snapshotAgeMs,
      candidates: rankLiveAvailabilityCandidates(snapshot.candidates, input.preferredTimeRange),
      requiresRecheck: true,
      message: "直近のスナップショットから候補を返しました。選択後に再確認します。",
      queueWaitMs: 0,
      rpaReadMs: 0,
      cacheKey,
    };
  }

  const refreshTask = runApotoolTask(
    {
      priority: "live_availability_read",
      label: `live-availability:${input.conversationId}:${input.preferredDate}`,
      details: {
        conversationId: input.conversationId,
        serviceLine: input.serviceLine,
        preferredDate: input.preferredDate,
      },
    },
    async () => {
      const candidates = await readAvailabilityCandidatesFromApotool({
        requestedDates: [input.preferredDate],
        details: {
          conversationId: input.conversationId,
          serviceLine: input.serviceLine,
        },
      });
      writeAvailabilitySnapshot({
        serviceLine: input.serviceLine,
        date: input.preferredDate,
        source: "apotool_live",
        staleAfterMs: config.appointmentLiveSnapshotFreshMs,
        expiresAt: new Date(Date.now() + config.appointmentLiveSnapshotMaxAgeMs),
        candidates,
      });
      return candidates;
    }
  );

  const timeoutToken = Symbol("timeout");
  const refreshResult = await Promise.race([
    refreshTask,
    sleep(config.appointmentLiveWaitTimeoutMs, timeoutToken),
  ]);

  if (refreshResult === timeoutToken) {
    if (
      snapshot &&
      snapshotAgeMs !== null &&
      snapshotAgeMs <= config.appointmentLiveSnapshotMaxAgeMs
    ) {
      return {
        status: "resolved",
        source: "snapshot_stale",
        stale: true,
        freshnessMs: snapshotAgeMs,
        candidates: rankLiveAvailabilityCandidates(snapshot.candidates, input.preferredTimeRange),
        requiresRecheck: true,
        message:
          "最新確認は継続中ですが、直近のスナップショットから暫定候補を返しました。選択後に再確認します。",
        queueWaitMs: null,
        rpaReadMs: null,
        cacheKey,
      };
    }

    return {
      status: "pending_followup",
      source: "timeout_pending",
      stale: false,
      freshnessMs: null,
      candidates: [],
      requiresRecheck: true,
      message: "候補確認に時間がかかっているため、通話後の確認で確定します。",
      queueWaitMs: null,
      rpaReadMs: null,
      cacheKey,
    };
  }

  const rankedCandidates = rankLiveAvailabilityCandidates(refreshResult.value, input.preferredTimeRange);
  return {
    status: "resolved",
    source: "apotool_live",
    stale: false,
    freshnessMs: 0,
    candidates: rankedCandidates,
    requiresRecheck: true,
    message: "Apotool の最新状態から候補を返しました。選択後に再確認します。",
    queueWaitMs: refreshResult.queuedMs,
    rpaReadMs: refreshResult.executionMs,
    cacheKey,
  };
}

export async function confirmLiveHold(
  input: LiveHoldConfirmInput
): Promise<LiveHoldConfirmResult> {
  const config = getAppointmentLiveRuntimeSettings();
  const menuMapping = findServiceMenuMapping(input.serviceLine);
  const leaseId = crypto.randomUUID();

  if (!menuMapping || menuMapping.automationPolicy !== "rpa_supported") {
    return {
      status: "manual_only",
      leaseId,
      message: "この予約種別は通話中の自動確定では扱わず、院内確認へ回します。",
      staleSnapshotUsed: false,
      queueWaitMs: null,
      processingMs: null,
      execution: null,
    };
  }

  createHoldLease({
    leaseId,
    conversationId: input.conversationId,
    serviceLine: input.serviceLine,
    candidateDate: input.preferredDate,
    candidateTcStartTime: input.selectedTcStartTime,
    expiresAt: new Date(Date.now() + config.appointmentLiveHoldLeaseMs),
    details: {
      patientName: input.patientName,
      phoneNumber: input.phoneNumber,
    },
  });

  const holdTask = runApotoolTask(
    {
      priority: "live_hold_confirm",
      label: `live-hold-confirm:${input.conversationId}:${input.preferredDate}:${input.selectedTcStartTime}`,
      details: {
        conversationId: input.conversationId,
        serviceLine: input.serviceLine,
        preferredDate: input.preferredDate,
        selectedTcStartTime: input.selectedTcStartTime,
      },
    },
    async () => {
      const freshCandidates = await readAvailabilityCandidatesFromApotool({
        requestedDates: [input.preferredDate],
        details: {
          conversationId: input.conversationId,
          serviceLine: input.serviceLine,
        },
      });
      writeAvailabilitySnapshot({
        serviceLine: input.serviceLine,
        date: input.preferredDate,
        source: "apotool_live",
        staleAfterMs: config.appointmentLiveSnapshotFreshMs,
        expiresAt: new Date(Date.now() + config.appointmentLiveSnapshotMaxAgeMs),
        candidates: freshCandidates,
      });

      const matchedCandidate = matchCandidate(
        freshCandidates,
        input.preferredDate,
        input.selectedTcStartTime
      );
      if (!matchedCandidate) {
        updateHoldLease({
          leaseId,
          status: "rejected",
          details: {
            reason: "selected_candidate_not_found",
          },
        });
        return {
          status: "rejected" as const,
          execution: null,
        };
      }

      const liveDraft = buildLiveDraft({
        conversationId: input.conversationId,
        serviceLine: input.serviceLine,
        preferredDate: input.preferredDate,
        preferredTimeRange: input.preferredTimeRange,
        patientName: input.patientName,
        phoneNumber: input.phoneNumber,
        isNewPatient: input.isNewPatient,
        visitReason: input.visitReason,
      });
      const preparedDraft = applyAvailabilityResults(liveDraft, freshCandidates, null);
      const execution = await submitBookingWithProvider({
        draft: preparedDraft,
        selectedCandidateId: matchedCandidate.id,
        priority: "live_hold_confirm",
        taskLabel: `live-booking:${input.conversationId}:${matchedCandidate.id}`,
      });

      updateHoldLease({
        leaseId,
        status: execution.success ? "confirmed" : "rejected",
        details: {
          executionMessage: execution.message,
          selectedCandidateId: matchedCandidate.id,
        },
      });

      return {
        status: execution.success ? ("confirmed" as const) : ("rejected" as const),
        execution,
      };
    }
  );

  const timeoutToken = Symbol("timeout");
  const holdResult = await Promise.race([holdTask, sleep(config.appointmentLiveWaitTimeoutMs, timeoutToken)]);
  if (holdResult === timeoutToken) {
    updateHoldLease({
      leaseId,
      status: "pending_finalize_post_call",
      details: {
        reason: "wait_timeout",
      },
    });
    return {
      status: "pending_finalize_post_call",
      leaseId,
      message: "確定処理は継続しますが、通話中の待機上限を超えたため通話後確定に切り替えます。",
      staleSnapshotUsed: false,
      queueWaitMs: null,
      processingMs: null,
      execution: null,
    };
  }

  return {
    status: holdResult.value.status,
    leaseId,
    message:
      holdResult.value.status === "confirmed"
        ? "選択候補を再確認して予約投入しました。"
        : "選択候補は最新状態で確保できなかったため、別候補の再案内が必要です。",
    staleSnapshotUsed: false,
    queueWaitMs: holdResult.queuedMs,
    processingMs: holdResult.executionMs,
    execution: holdResult.value.execution,
  };
}

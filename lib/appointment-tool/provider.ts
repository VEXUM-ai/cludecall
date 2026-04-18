import {
  applyAvailabilityResults,
  buildExecutionCandidatePreview,
  createAvailabilityCandidate,
  findServiceMenuMapping,
  getAppointmentAutomationBlockReason,
  markAppointmentExecutionFailed,
  markAppointmentExecutionStarted,
  markAppointmentExecutionSubmitted,
} from "@/lib/appointments";
import { appendDemoAppointmentLog } from "@/lib/appointment-demo-log";
import {
  runApotoolTaskValue,
  type ApotoolTaskPriority,
} from "@/lib/appointment-tool/apotool-task-queue";
import { writeAppointmentAudit } from "@/lib/appointment-tool/audit";
import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import { findAvailableSlots } from "@/lib/appointment-tool/apotool-rpa/availability";
import { bookAppointment } from "@/lib/appointment-tool/apotool-rpa/booking";
import { navigateToDate, readCalendarGrid } from "@/lib/appointment-tool/apotool-rpa/calendar";
import {
  ensureLoggedIn,
  getApotoolSessionState,
  takeErrorScreenshot,
} from "@/lib/appointment-tool/apotool-rpa/session-manager";
import { getServerConfig } from "@/lib/env";
import type {
  AppointmentAuditRef,
  AppointmentAvailabilityCandidate,
  AppointmentDraft,
  AppointmentToolAvailabilityResult,
  AppointmentToolExecutionResult,
  AppointmentToolHealth,
} from "@/lib/types";

function extractExactDate(value: string | null) {
  if (!value) {
    return null;
  }

  const normalized = value.split("->").pop()?.trim() ?? value.trim();
  return /^\d{4}-\d{2}-\d{2}$/.test(normalized) ? normalized : null;
}

function getDraftCandidateDates(draft: AppointmentDraft) {
  return [...new Set(draft.preferredSlots.map((slot) => extractExactDate(slot.date)).filter(Boolean))] as string[];
}

export async function readAvailabilityCandidatesFromApotool(args: {
  requestedDates: string[];
  priority?: ApotoolTaskPriority;
  taskLabel?: string;
  details?: Record<string, unknown>;
}) {
  const requestedDates = [...new Set(args.requestedDates.filter(Boolean))];
  return runApotoolTaskValue(
    {
      priority: args.priority ?? "snapshot_refresh",
      label: args.taskLabel ?? `availability:${requestedDates.join(",")}`,
      details: {
        requestedDates,
        ...(args.details ?? {}),
      },
    },
    async () => {
      const page = await ensureLoggedIn();
      const candidates: AppointmentAvailabilityCandidate[] = [];

      for (const date of requestedDates) {
        await navigateToDate(page, date);
        const calendarGrid = await readCalendarGrid(page);
        const slots = findAvailableSlots(calendarGrid);
        candidates.push(
          ...slots.map((slot) =>
            createAvailabilityCandidate({
              date,
              tcStartTime: slot.start_time,
              tcUnit: slot.tc_unit,
              treatmentUnit: slot.treatment_unit,
              notes: [`derived from ${date}`],
            })
          )
        );
      }

      return candidates;
    }
  );
}

function buildManualOnlyError(draft: AppointmentDraft) {
  const menuMapping = findServiceMenuMapping(draft.serviceLine) ?? draft.menuMapping;
  return (
    getAppointmentAutomationBlockReason({
      triageLevel: draft.triageLevel,
      menuMapping,
    }) ??
    "この受付区分は v1 では RPA 実行対象外のため、手動確認が必要です。"
  );
}

function normalizeComparableText(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase();
}

function getTodayIsoInTimeZone(timeZone: string) {
  const formatter = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(new Date());
  const pick = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${pick("year")}-${pick("month")}-${pick("day")}`;
}

function addDaysToIsoDate(isoDate: string, days: number) {
  const [year, month, day] = isoDate.split("-").map((value) => Number.parseInt(value, 10));
  const date = new Date(Date.UTC(year, month - 1, day));
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

export function evaluateAppointmentExecutionGuard(args: {
  draft: AppointmentDraft;
  candidate: AppointmentAvailabilityCandidate;
}) {
  const config = getServerConfig();
  if (config.appointmentExecutionPolicy !== "test_only") {
    return null;
  }

  const hasConfiguredPatientPatterns = config.appointmentTestPatientPatterns.length > 0;
  const combinedPatientName = [args.draft.patientName]
    .filter((value): value is string => Boolean(value))
    .join(" ");
  const patientMatchesPattern =
    !hasConfiguredPatientPatterns ||
    config.appointmentTestPatientPatterns.some((pattern) =>
      normalizeComparableText(combinedPatientName).includes(normalizeComparableText(pattern))
    );
  const minAllowedDate = addDaysToIsoDate(
    getTodayIsoInTimeZone(config.demoTimezone),
    config.appointmentTestMinLeadDays
  );

  const violations: string[] = [];
  if (hasConfiguredPatientPatterns && !patientMatchesPattern) {
    violations.push(
      `患者名にテスト用キーワード（${config.appointmentTestPatientPatterns.join(" / ")}）が含まれていません`
    );
  }
  if (!args.candidate.date || args.candidate.date < minAllowedDate) {
    violations.push(`予約日は ${minAllowedDate} 以降の候補だけ実行できます`);
  }

  if (violations.length === 0) {
    return null;
  }

  return `APPOINTMENT_EXECUTION_POLICY=test_only のため実行を停止しました。${violations.join(" / ")}`;
}

export async function getAppointmentToolHealth(): Promise<AppointmentToolHealth> {
  const config = getServerConfig();
  if (!config.appointmentToolProvider) {
    return {
      provider: null,
      status: "disabled",
      checkedAt: new Date().toISOString(),
      message: "No appointment tool provider is configured.",
      details: {},
    };
  }

  const sessionState = getApotoolSessionState();
  const credentialsReady = Boolean(config.apotoolEmail && config.apotoolPassword);
  return {
    provider: config.appointmentToolProvider,
    status: credentialsReady ? "healthy" : "degraded",
    checkedAt: new Date().toISOString(),
    message: credentialsReady
      ? `Apotool RPA adapter is configured. Execution policy: ${config.appointmentExecutionPolicy}. Browser session is started lazily.`
      : "Apotool credentials are missing. Review can continue, but execution will fall back to manual handling.",
    details: {
      credentialsReady,
      browserReady: sessionState.browserReady,
      contextReady: sessionState.contextReady,
      pageReady: sessionState.pageReady,
      executionPolicy: config.appointmentExecutionPolicy,
      testPatientPatterns: config.appointmentTestPatientPatterns.join(", "),
      testMinLeadDays: String(config.appointmentTestMinLeadDays),
      loginUrl: config.apotoolLoginUrl,
      clinicName: config.apotoolClinicName,
    },
  };
}

export async function checkAvailabilityWithProvider(
  draft: AppointmentDraft
): Promise<AppointmentToolAvailabilityResult> {
  if (draft.provider !== "apotool_rpa") {
    const error = "Only the apotool_rpa provider is supported in this build.";
    const auditRef = await writeAppointmentAudit({
      action: "availability",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: { conversationId: draft.conversationId },
      error,
    });
    return {
      draft: applyAvailabilityResults(draft, [], auditRef, error),
      candidates: [],
      auditRef,
    };
  }

  const menuMapping = findServiceMenuMapping(draft.serviceLine) ?? draft.menuMapping;
  if (
    getAppointmentAutomationBlockReason({
      triageLevel: draft.triageLevel,
      menuMapping,
    })
  ) {
    const error = buildManualOnlyError(draft);
    const auditRef = await writeAppointmentAudit({
      action: "availability",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        serviceLine: draft.serviceLine,
      },
      error,
    });
    return {
      draft: applyAvailabilityResults(draft, [], auditRef, error),
      candidates: [],
      auditRef,
    };
  }

  const candidateDates = getDraftCandidateDates(draft);
  if (candidateDates.length === 0) {
    const error = "候補枠探索に使える具体日付がありません。日時を人手で確認してください。";
    const auditRef = await writeAppointmentAudit({
      action: "availability",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        preferredSlots: draft.preferredSlots,
      },
      error,
    });
    return {
      draft: applyAvailabilityResults(draft, [], auditRef, error),
      candidates: [],
      auditRef,
    };
  }

  try {
    const candidates = await readAvailabilityCandidatesFromApotool({
      requestedDates: candidateDates,
      priority: "post_call_booking",
      taskLabel: `availability:${draft.conversationId}`,
      details: {
        conversationId: draft.conversationId,
        serviceLine: draft.serviceLine,
      },
    });

    const auditRef = await writeAppointmentAudit({
      action: "availability",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        requestedDates: candidateDates,
        preferredSlots: draft.preferredSlots,
        serviceLine: draft.serviceLine,
      },
      response: {
        candidateCount: candidates.length,
        candidates: candidates.map((candidate) => ({
          id: candidate.id,
          label: buildExecutionCandidatePreview(candidate),
        })),
      },
    });

    return {
      draft: applyAvailabilityResults(draft, candidates, auditRef, null),
      candidates,
      auditRef,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const screenshotPath = await takeErrorScreenshot("availability-failed");
    const auditRef = await writeAppointmentAudit({
      action: "availability",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        requestedDates: candidateDates,
        preferredSlots: draft.preferredSlots,
        serviceLine: draft.serviceLine,
      },
      error: message,
      screenshotPaths: screenshotPath ? [screenshotPath] : [],
    });
    return {
      draft: applyAvailabilityResults(draft, [], auditRef, message),
      candidates: [],
      auditRef,
    };
  }

}

export async function submitBookingWithProvider(args: {
  draft: AppointmentDraft;
  selectedCandidateId: string;
  priority?: ApotoolTaskPriority;
  taskLabel?: string;
}): Promise<AppointmentToolExecutionResult> {
  const {
    draft,
    selectedCandidateId,
    priority = "post_call_booking",
    taskLabel = `booking:${args.draft.conversationId}:${selectedCandidateId}`,
  } = args;
  const selectedCandidate = draft.availabilityCandidates.find(
    (candidate) => candidate.id === selectedCandidateId
  );

  if (!selectedCandidate) {
    const error = "選択された候補枠が見つかりません。候補枠を再取得してください。";
    const auditRef = await writeAppointmentAudit({
      action: "execute",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
      },
      error,
    });
    return {
      draft: markAppointmentExecutionFailed(draft, error, auditRef, true),
      success: false,
      orphanRisk: false,
      auditRef,
      message: error,
    };
  }

  const menuMapping = findServiceMenuMapping(draft.serviceLine) ?? draft.menuMapping;
  if (
    getAppointmentAutomationBlockReason({
      triageLevel: draft.triageLevel,
      menuMapping,
    })
  ) {
    const error = buildManualOnlyError(draft);
    const auditRef = await writeAppointmentAudit({
      action: "execute",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
        serviceLine: draft.serviceLine,
      },
      error,
    });
    return {
      draft: markAppointmentExecutionFailed(draft, error, auditRef, true),
      success: false,
      orphanRisk: false,
      auditRef,
      message: error,
    };
  }

  if (!menuMapping) {
    const error = buildManualOnlyError(draft);
    const auditRef = await writeAppointmentAudit({
      action: "execute",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
        serviceLine: draft.serviceLine,
      },
      error,
    });
    return {
      draft: markAppointmentExecutionFailed(draft, error, auditRef, true),
      success: false,
      orphanRisk: false,
      auditRef,
      message: error,
    };
  }

  const patientName = draft.patientName;
  if (!patientName) {
    const error = "患者名が未取得のため、自動投入できません。";
    const auditRef = await writeAppointmentAudit({
      action: "execute",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
      },
      error,
    });
    return {
      draft: markAppointmentExecutionFailed(draft, error, auditRef, true),
      success: false,
      orphanRisk: false,
      auditRef,
      message: error,
    };
  }

  const executionGuardError = evaluateAppointmentExecutionGuard({
    draft,
    candidate: selectedCandidate,
  });
  if (executionGuardError) {
    const auditRef = await writeAppointmentAudit({
      action: "execute",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
        candidate: selectedCandidate,
      },
      error: executionGuardError,
    });
    return {
      draft: markAppointmentExecutionFailed(draft, executionGuardError, auditRef, true),
      success: false,
      orphanRisk: false,
      auditRef,
      message: executionGuardError,
    };
  }

  let workingDraft = markAppointmentExecutionStarted(draft, selectedCandidateId);
  let result;
  try {
    result = await runApotoolTaskValue(
      {
        priority,
        label: taskLabel,
        details: {
          conversationId: draft.conversationId,
          selectedCandidateId,
          candidateDate: selectedCandidate.date,
          candidateTcStartTime: selectedCandidate.tcStartTime,
        },
      },
      async () => {
        const page = await ensureLoggedIn();
        await navigateToDate(page, selectedCandidate.date);
        return bookAppointment(page, {
          patientName,
          phoneNumber: draft.phoneNumber ?? "",
          candidate: selectedCandidate,
          menuMapping,
        });
      }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const screenshotPath = await takeErrorScreenshot("execute-failed");
    const auditRef = await writeAppointmentAudit({
      action: "execute",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
        candidate: selectedCandidate,
      },
      error: message,
      screenshotPaths: screenshotPath ? [screenshotPath] : [],
    });

    return {
      draft: markAppointmentExecutionFailed(workingDraft, message, auditRef, true),
      success: false,
      orphanRisk: false,
      auditRef,
      message,
    };
  }

  if (!result.success) {
    const screenshotPath = await takeErrorScreenshot("execute-failed");
    const auditRef = await writeAppointmentAudit({
      action: "execute",
      conversationId: draft.conversationId,
      provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
        candidate: selectedCandidate,
      },
      response: {
        success: result.success,
        orphanRisk: result.tc_orphaned,
      },
      error: result.message,
      screenshotPaths: screenshotPath ? [screenshotPath] : [],
    });

    return {
      draft: markAppointmentExecutionFailed(workingDraft, result.message, auditRef, result.tc_orphaned),
      success: false,
      orphanRisk: result.tc_orphaned,
      auditRef,
      message: result.message,
    };
  }

  const auditRef = await writeAppointmentAudit({
    action: "execute",
    conversationId: draft.conversationId,
    provider: draft.provider,
      request: {
        conversationId: draft.conversationId,
        selectedCandidateId,
        candidate: selectedCandidate,
        patientName,
      },
    response: {
      success: true,
      orphanRisk: false,
      message: result.message,
    },
  });

  appointmentToolLogger.info("Apotool booking submitted.", {
    conversationId: draft.conversationId,
    selectedCandidateId,
  });

  workingDraft = markAppointmentExecutionSubmitted(workingDraft, selectedCandidateId, auditRef);
  await appendDemoAppointmentLog({
    action: "booked",
    draft: workingDraft,
    candidate: selectedCandidate,
    auditRef,
    note: "Recorded after successful Apotool submission.",
  });
  return {
    draft: workingDraft,
    success: true,
    orphanRisk: false,
    auditRef,
    message: result.message,
  };
}

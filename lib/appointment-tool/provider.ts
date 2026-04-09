import {
  applyAvailabilityResults,
  buildExecutionCandidatePreview,
  createAvailabilityCandidate,
  findServiceMenuMapping,
  markAppointmentExecutionFailed,
  markAppointmentExecutionStarted,
  markAppointmentExecutionSubmitted,
} from "@/lib/appointments";
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

function buildManualOnlyError(draft: AppointmentDraft) {
  return (
    draft.menuMapping?.notes[0] ??
    "この受付区分は v1 では RPA 実行対象外のため、手動確認が必要です。"
  );
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
      ? "Apotool RPA adapter is configured. Browser session is started lazily."
      : "Apotool credentials are missing. Review can continue, but execution will fall back to manual handling.",
    details: {
      credentialsReady,
      browserReady: sessionState.browserReady,
      contextReady: sessionState.contextReady,
      pageReady: sessionState.pageReady,
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

  if (!draft.menuMapping || draft.menuMapping.automationPolicy !== "rpa_supported") {
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

  const page = await ensureLoggedIn();
  const candidates: AppointmentAvailabilityCandidate[] = [];
  for (const date of candidateDates) {
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
}

export async function submitBookingWithProvider(args: {
  draft: AppointmentDraft;
  selectedCandidateId: string;
}): Promise<AppointmentToolExecutionResult> {
  const { draft, selectedCandidateId } = args;
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

  const menuMapping = draft.menuMapping ?? findServiceMenuMapping(draft.serviceLine);
  if (!menuMapping || menuMapping.automationPolicy !== "rpa_supported") {
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

  const patientNameKana = draft.patientNameYomi ?? draft.patientName;
  if (!patientNameKana) {
    const error = "患者名の読みが未取得のため、自動投入できません。";
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

  let workingDraft = markAppointmentExecutionStarted(draft, selectedCandidateId);
  const page = await ensureLoggedIn();
  await navigateToDate(page, selectedCandidate.date);

  const result = await bookAppointment(page, {
    patientNameKana,
    phoneNumber: draft.phoneNumber ?? "",
    candidate: selectedCandidate,
    menuMapping,
  });

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
      patientNameKana,
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
  return {
    draft: workingDraft,
    success: true,
    orphanRisk: false,
    auditRef,
    message: result.message,
  };
}

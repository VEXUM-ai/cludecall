import { appointmentToolLogger } from "@/lib/appointment-tool/logger";
import { getAppointmentToolBootRuntimeSettings } from "@/lib/env";

type ApotoolBootPrewarmSettings = ReturnType<typeof getAppointmentToolBootRuntimeSettings>;

type ApotoolBootPrewarmDecision =
  | { shouldRun: true }
  | { shouldRun: false; reason: string };

declare global {
  var __apotoolBootPrewarmScheduled__: boolean | undefined;
}

export function getApotoolBootPrewarmDecision(args: {
  runtime: string | null | undefined;
  settings: ApotoolBootPrewarmSettings;
}): ApotoolBootPrewarmDecision {
  if (args.runtime !== "nodejs") {
    return {
      shouldRun: false,
      reason: "non_nodejs_runtime",
    };
  }

  if (!args.settings.appointmentToolPrewarmOnBoot) {
    return {
      shouldRun: false,
      reason: "disabled_by_env",
    };
  }

  if (args.settings.appointmentToolProvider !== "apotool_rpa") {
    return {
      shouldRun: false,
      reason: "provider_not_supported",
    };
  }

  if (!args.settings.apotoolEmail || !args.settings.apotoolPassword) {
    return {
      shouldRun: false,
      reason: "missing_credentials",
    };
  }

  return {
    shouldRun: true,
  };
}

export function resetApotoolBootPrewarmStateForTests() {
  globalThis.__apotoolBootPrewarmScheduled__ = false;
}

export function scheduleApotoolBootPrewarm(args?: {
  runtime?: string | null;
  settings?: ApotoolBootPrewarmSettings;
  prewarm?: () => Promise<unknown>;
}) {
  const runtime = args?.runtime ?? process.env.NEXT_RUNTIME ?? "nodejs";
  const settings = args?.settings ?? getAppointmentToolBootRuntimeSettings();
  const decision = getApotoolBootPrewarmDecision({
    runtime,
    settings,
  });

  if (!decision.shouldRun) {
    appointmentToolLogger.info("Skipping Apotool boot prewarm.", {
      reason: decision.reason,
    });
    return false;
  }

  if (globalThis.__apotoolBootPrewarmScheduled__) {
    appointmentToolLogger.debug("Apotool boot prewarm is already scheduled.");
    return false;
  }

  globalThis.__apotoolBootPrewarmScheduled__ = true;
  appointmentToolLogger.info("Scheduling Apotool boot prewarm.");

  queueMicrotask(() => {
    const runPrewarm =
      args?.prewarm ??
      (async () => {
        const { prewarmApotoolSession } = await import(
          "@/lib/appointment-tool/apotool-rpa/session-manager"
        );
        return prewarmApotoolSession();
      });

    void runPrewarm()
      .then(() => {
        appointmentToolLogger.info("Apotool boot prewarm finished successfully.");
      })
      .catch((error) => {
        appointmentToolLogger.error("Apotool boot prewarm failed.", error);
      });
  });

  return true;
}

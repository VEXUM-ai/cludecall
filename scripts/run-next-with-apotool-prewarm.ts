import { spawn } from "node:child_process";
import { setTimeout as sleep } from "node:timers/promises";

import { scheduleApotoolBootPrewarm } from "../lib/appointment-tool/apotool-prewarm";
import { getAppointmentToolBootRuntimeSettings } from "../lib/env";
import { loadDotenvFile } from "./load-dotenv";

type Mode = "dev" | "start";

function getMode(argv: string[]): Mode {
  const value = argv[2];
  if (value === "dev" || value === "start") {
    return value;
  }
  return "dev";
}

function getCommand(mode: Mode) {
  if (mode === "start") {
    return "tsx scripts/patch-next-runtime.ts && next start";
  }

  return "next dev";
}

async function waitForServerReady(baseUrl: string) {
  const deadline = Date.now() + 2 * 60 * 1000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/api/appointment-tool/health`);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until the server is ready.
    }

    await sleep(1000);
  }

  throw new Error("Timed out waiting for the Next.js server before Apotool prewarm.");
}

async function triggerPrewarm(baseUrl: string, sharedSecret: string | null) {
  await waitForServerReady(baseUrl);

  const response = await fetch(`${baseUrl}/api/appointment-tool/prewarm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(sharedSecret
        ? {
            "x-appointment-tool-secret": sharedSecret,
          }
        : {}),
    },
  });

  if (!response.ok) {
    throw new Error(`Apotool prewarm endpoint returned ${response.status}.`);
  }
}

async function main() {
  loadDotenvFile();

  const mode = getMode(process.argv);
  const port = Number.parseInt(process.env.PORT ?? "3000", 10);
  const baseUrl = `http://127.0.0.1:${port}`;
  const command = getCommand(mode);
  const child = spawn(command, {
    stdio: "inherit",
    env: process.env,
    shell: true,
  });

  scheduleApotoolBootPrewarm({
    runtime: "nodejs",
    settings: getAppointmentToolBootRuntimeSettings(),
    prewarm: async () => {
      await triggerPrewarm(
        baseUrl,
        process.env.APPOINTMENT_TOOL_WEBHOOK_SECRET?.trim() ?? null
      );
    },
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code ?? 0);
  });
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

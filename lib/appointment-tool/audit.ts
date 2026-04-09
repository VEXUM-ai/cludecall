import { promises as fs } from "node:fs";
import path from "node:path";

import type { AppointmentAuditRef } from "@/lib/types";

type AuditAction = "review" | "availability" | "execute";

type AppointmentAuditInput = {
  action: AuditAction;
  conversationId: string;
  provider: string | null;
  request: Record<string, unknown>;
  response?: Record<string, unknown> | null;
  error?: string | null;
  screenshotPaths?: string[];
};

type StoredAppointmentAudit = AppointmentAuditInput & {
  auditId: string;
  createdAt: string;
};

function getAuditDir() {
  return path.resolve(process.cwd(), "artifacts", "appointment-tool", "audits");
}

export function getAppointmentScreenshotDir() {
  return path.resolve(process.cwd(), "artifacts", "appointment-tool", "screenshots");
}

function buildAuditPath(auditId: string) {
  return path.join(getAuditDir(), `${auditId}.json`);
}

export async function writeAppointmentAudit(
  input: AppointmentAuditInput
): Promise<AppointmentAuditRef> {
  const auditId = `${new Date().toISOString().replace(/[:.]/g, "-")}-${input.conversationId}-${input.action}`;
  const createdAt = new Date().toISOString();
  const audit: StoredAppointmentAudit = {
    ...input,
    response: input.response ?? null,
    error: input.error ?? null,
    screenshotPaths: input.screenshotPaths ?? [],
    auditId,
    createdAt,
  };

  await fs.mkdir(getAuditDir(), { recursive: true });
  const logPath = buildAuditPath(auditId);
  await fs.writeFile(logPath, JSON.stringify(audit, null, 2), "utf8");

  return {
    auditId,
    logPath,
    screenshotPaths: audit.screenshotPaths ?? [],
    lastAction: input.action,
    updatedAt: createdAt,
  };
}

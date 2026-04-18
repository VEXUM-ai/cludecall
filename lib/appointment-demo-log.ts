import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  AppointmentAuditRef,
  AppointmentAvailabilityCandidate,
  AppointmentDraft,
} from "@/lib/types";

type DemoAppointmentAction = "booked" | "canceled";

type DemoAppointmentLogEntry = {
  loggedAt: string;
  action: DemoAppointmentAction;
  patientName: string | null;
  scheduledAt: string | null;
  conversationId: string | null;
  candidateLabel: string | null;
  auditId: string | null;
  note: string | null;
};

function getDemoAppointmentLogJsonPath() {
  return path.resolve(
    process.cwd(),
    "artifacts",
    "appointment-tool",
    "demo-appointment-log.json"
  );
}

function getDemoAppointmentLogMarkdownPath() {
  return path.resolve(process.cwd(), "docs", "demo-appointment-log.md");
}

async function readExistingEntries() {
  try {
    const raw = await fs.readFile(getDemoAppointmentLogJsonPath(), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as DemoAppointmentLogEntry[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function renderMarkdown(entries: DemoAppointmentLogEntry[]) {
  const lines = [
    "# Demo Appointment Log",
    "",
    "| Logged At | Action | Patient | Scheduled At | Conversation ID | Candidate | Audit ID | Note |",
    "| --- | --- | --- | --- | --- | --- | --- | --- |",
  ];

  for (const entry of entries) {
    lines.push(
      `| ${entry.loggedAt} | ${entry.action} | ${entry.patientName ?? ""} | ${
        entry.scheduledAt ?? ""
      } | ${entry.conversationId ?? ""} | ${entry.candidateLabel ?? ""} | ${
        entry.auditId ?? ""
      } | ${entry.note ?? ""} |`
    );
  }

  return `${lines.join("\n")}\n`;
}

async function writeEntries(entries: DemoAppointmentLogEntry[]) {
  await fs.mkdir(path.dirname(getDemoAppointmentLogJsonPath()), { recursive: true });
  await fs.mkdir(path.dirname(getDemoAppointmentLogMarkdownPath()), { recursive: true });
  await fs.writeFile(
    getDemoAppointmentLogJsonPath(),
    JSON.stringify(entries, null, 2),
    "utf8"
  );
  await fs.writeFile(
    getDemoAppointmentLogMarkdownPath(),
    renderMarkdown(entries),
    "utf8"
  );
}

export async function appendDemoAppointmentLog(args: {
  action: DemoAppointmentAction;
  draft: Pick<AppointmentDraft, "conversationId" | "patientName" | "scheduledDatetime">;
  candidate?: Pick<AppointmentAvailabilityCandidate, "label" | "date" | "tcStartTime"> | null;
  auditRef?: Pick<AppointmentAuditRef, "auditId"> | null;
  note?: string | null;
}) {
  const entries = await readExistingEntries();
  const scheduledAt =
    args.draft.scheduledDatetime ??
    (args.candidate ? `${args.candidate.date} ${args.candidate.tcStartTime}` : null);

  entries.push({
    loggedAt: new Date().toISOString(),
    action: args.action,
    patientName: args.draft.patientName ?? null,
    scheduledAt,
    conversationId: args.draft.conversationId ?? null,
    candidateLabel: args.candidate?.label ?? null,
    auditId: args.auditRef?.auditId ?? null,
    note: args.note ?? null,
  });

  await writeEntries(entries);
  return {
    jsonPath: getDemoAppointmentLogJsonPath(),
    markdownPath: getDemoAppointmentLogMarkdownPath(),
  };
}

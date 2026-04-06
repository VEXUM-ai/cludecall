import { promises as fs } from "node:fs";
import path from "node:path";

import type { AppointmentDraft } from "@/lib/types";

const APPOINTMENT_DRAFTS_DIR = path.resolve(
  process.cwd(),
  "output",
  "appointment-drafts"
);

function getDraftPath(conversationId: string) {
  return path.join(APPOINTMENT_DRAFTS_DIR, `${conversationId}.json`);
}

export async function readStoredAppointmentDraft(
  conversationId: string
): Promise<AppointmentDraft | null> {
  try {
    const raw = await fs.readFile(getDraftPath(conversationId), "utf8");
    return JSON.parse(raw) as AppointmentDraft;
  } catch (error) {
    if (
      typeof error === "object" &&
      error !== null &&
      "code" in error &&
      (error as { code?: unknown }).code === "ENOENT"
    ) {
      return null;
    }

    throw error;
  }
}

export async function writeStoredAppointmentDraft(draft: AppointmentDraft) {
  await fs.mkdir(APPOINTMENT_DRAFTS_DIR, { recursive: true });
  const filePath = getDraftPath(draft.conversationId);
  await fs.writeFile(filePath, JSON.stringify(draft, null, 2), "utf8");
  return {
    draft,
    filePath,
  };
}

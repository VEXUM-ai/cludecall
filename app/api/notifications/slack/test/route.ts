import { NextResponse } from "next/server";

import { sendSlackAppointmentNotification } from "@/lib/notifications/slack";

export const runtime = "nodejs";

export async function POST() {
  const result = await sendSlackAppointmentNotification({
    kind: "manual_followup_required",
    conversationId: "slack-test",
    clinicName: "えみは総合歯科 大阪梅田院",
    patientName: "Slack テスト",
    phoneNumber: null,
    serviceLine: "general_initial",
    triageLevel: "routine",
    message: "Slack テスト通知です。",
    selectedCandidateLabel: null,
    auditRef: null,
  });

  return NextResponse.json(result, {
    status: result.state === "failed" ? 500 : 200,
  });
}

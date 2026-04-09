import { NextResponse } from "next/server";

import { getAppointmentToolHealth } from "@/lib/appointment-tool/provider";

export const runtime = "nodejs";

export async function GET() {
  try {
    const health = await getAppointmentToolHealth();
    return NextResponse.json(health);
  } catch (error) {
    const message =
      error instanceof Error ? error.message : "Failed to read appointment tool health.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

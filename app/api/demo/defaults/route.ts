import { NextResponse } from "next/server";

import { getDemoRuntimeSettings } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  return NextResponse.json(getDemoRuntimeSettings());
}

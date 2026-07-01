import dashboardRuntime from "../../../scripts/dashboard_runtime.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const runId = searchParams.get("run_id") || undefined;
    const result = await dashboardRuntime.getDashboardState(process.cwd(), runId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

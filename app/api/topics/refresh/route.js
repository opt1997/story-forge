import dashboardRuntime from "../../../../scripts/dashboard_runtime.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const body = await request.json().catch(() => ({}));
    const root = process.env.STORY_FORGE_DATA_ROOT || process.cwd();
    const result = await dashboardRuntime.refreshTodayTopics(root, { limit: body.limit || 5 });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

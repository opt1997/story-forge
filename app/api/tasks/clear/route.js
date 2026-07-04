import dashboardRuntime from "../../../../scripts/dashboard_runtime.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST() {
  try {
    const root = process.env.STORY_FORGE_DATA_ROOT || process.cwd();
    const result = await dashboardRuntime.clearTaskQueue(root);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

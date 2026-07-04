import dashboardRuntime from "../../../../../../scripts/dashboard_runtime.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(_request, context) {
  try {
    const params = await context.params;
    const taskId = decodeURIComponent(params.task_id);
    const root = process.env.STORY_FORGE_DATA_ROOT || process.cwd();
    const result = await dashboardRuntime.cancelTask(root, taskId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

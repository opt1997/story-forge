import dashboardRuntime from "../../../../scripts/dashboard_runtime.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    if (!payload.topic_id) {
      throw new Error("topic_id is required.");
    }
    const root = process.env.STORY_FORGE_DATA_ROOT || process.cwd();
    const result = await dashboardRuntime.startDashboardRun(root, {
      count: 1,
      candidate_id: payload.topic_id,
      topic_title: payload.topic_title || payload.title || "",
    });
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

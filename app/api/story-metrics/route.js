import dashboardRuntime from "../../../scripts/dashboard_runtime.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function POST(request) {
  try {
    const payload = await request.json();
    if (!payload.story_id) {
      throw new Error("story_id is required.");
    }
    const result = await dashboardRuntime.updateStoryMetrics(
      process.cwd(),
      payload.story_id,
      payload.read_count,
      payload.drop_off_users,
    );
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

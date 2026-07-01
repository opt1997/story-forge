import dashboardRuntime from "../../../scripts/dashboard_runtime.js";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

export async function GET(request) {
  try {
    const { searchParams } = new URL(request.url);
    const storyId = searchParams.get("story_id");
    if (!storyId) {
      throw new Error("story_id is required.");
    }
    const result = await dashboardRuntime.getStoryDetail(process.cwd(), storyId);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }
}

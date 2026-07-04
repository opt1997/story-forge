import { spawn } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

function getStoriesRoot(root) {
  return path.resolve(process.env.STORIES_ROOT || path.join(root, "stories"));
}

function isInside(parent, target) {
  const relative = path.relative(parent, target);
  return relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative));
}

function openFolder(targetPath) {
  const platform = os.platform();
  const command = platform === "win32" ? "explorer.exe" : platform === "darwin" ? "open" : "xdg-open";
  const child = spawn(command, [targetPath], {
    detached: true,
    stdio: "ignore",
    windowsHide: false,
  });
  child.unref();
}

export async function POST(request) {
  try {
    const payload = await request.json().catch(() => ({}));
    const root = path.resolve(process.env.STORY_FORGE_DATA_ROOT || process.cwd());
    const storiesRoot = getStoriesRoot(root);
    const storyId = String(payload.story_id || "").trim();
    const targetPath = storyId ? path.resolve(storiesRoot, storyId) : storiesRoot;

    if (!isInside(storiesRoot, targetPath)) {
      return NextResponse.json({ error: "只能打开 stories 目录内的文件夹。" }, { status: 400 });
    }
    if (storyId && !/^[A-Za-z0-9][A-Za-z0-9_-]{0,100}$/.test(storyId)) {
      return NextResponse.json({ error: "作品文件夹 ID 不合法。" }, { status: 400 });
    }
    if (!existsSync(targetPath) || !statSync(targetPath).isDirectory()) {
      return NextResponse.json({ error: "目标文件夹不存在。" }, { status: 404 });
    }

    openFolder(targetPath);
    return NextResponse.json({
      ok: true,
      path: path.relative(root, targetPath).replaceAll("\\", "/") || ".",
    });
  } catch (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

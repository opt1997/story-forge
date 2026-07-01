import { randomUUID } from "crypto";
import { existsSync } from "fs";
import { mkdir, readFile, writeFile } from "fs/promises";
import path from "path";
import { spawn } from "child_process";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const PIPELINE_FILES = [
  ["today.json", "planning/today.json"],
  ["idea.json", "idea.json"],
  ["outline.json", "outline.json"],
  ["draft_v1.md", "draft_v1.md"],
  ["qa_v1.json", "qa_v1.json"],
  ["draft_v2.md", "draft_v2.md"],
  ["qa_v2.json", "qa_v2.json"],
  ["final.md", "final.md"],
  ["story_manifest.json", "story_manifest.json"],
  ["execution_trace.json", "execution_trace.json"],
  ["agent_io.jsonl", "agent_io.jsonl"],
  ["pipeline_state.json", "pipeline_state.json"],
  ["health_report.json", "health_report.json"],
];

function shanghaiDate() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());

  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}${values.month}${values.day}`;
}

function nodeCandidates() {
  return [
    process.env.STORY_FORGE_NODE,
    process.execPath,
    path.join(
      process.env.USERPROFILE || "C:\\Users\\Administrator",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "node",
      "bin",
      "node.exe",
    ),
  ].filter(Boolean);
}

function pythonCandidates() {
  return [
    process.env.STORY_FORGE_PYTHON,
    process.env.PYTHON,
    "python",
    "py",
    path.join(
      process.env.USERPROFILE || "C:\\Users\\Administrator",
      ".cache",
      "codex-runtimes",
      "codex-primary-runtime",
      "dependencies",
      "python",
      "python.exe",
    ),
  ].filter(Boolean);
}

function runCommand(command, args, cwd) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd,
      shell: false,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
      },
    });

    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Command exited with code ${code}`));
      }
    });
  });
}

async function runWorkflow(root) {
  const date = shanghaiDate();
  const provider = process.env.STORY_FORGE_LLM_PROVIDER || "mock";
  const aiExecutionScript = path.join(root, "scripts", "run_ai_execution.js");
  const aiErrors = [];

  for (const command of nodeCandidates()) {
    try {
      const stdout = await runCommand(command, [aiExecutionScript, `--date=${date}`, `--provider=${provider}`], root);
      return JSON.parse(stdout);
    } catch (error) {
      aiErrors.push(`${command}: ${error.message}`);
    }
  }

  const script = path.join(root, "scripts", "story_forge.py");
  const legacyErrors = [];

  for (const command of pythonCandidates()) {
    try {
      const args =
        path.basename(command).toLowerCase() === "py"
          ? ["-3", script, "start-today", "--date", date]
          : [script, "start-today", "--date", date];
      const stdout = await runCommand(command, args, root);
      return JSON.parse(stdout);
    } catch (error) {
      legacyErrors.push(`${command}: ${error.message}`);
    }
  }

  throw new Error(`Unable to run Workflow Engine. AI errors: ${aiErrors.join(" | ")} Legacy errors: ${legacyErrors.join(" | ")}`);
}

function healthReport(runId, storyId) {
  return {
    run_id: runId,
    story_id: storyId,
    generated_at: new Date().toISOString(),
    scores: {
      workflow: 100,
      data_flow: 100,
      agent_permission: 100,
      story_quality: 89,
      ai_vs_human_gap: 7,
      prompt_drift: "none",
      metrics_integrity: 100,
    },
    alerts: [],
    data_source: "M3.1 mock health report",
  };
}

async function writeHealthReport(root, storyDir, runId, storyId) {
  const report = healthReport(runId, storyId);
  const reportPath = path.join(root, storyDir, "health_report.json");
  await mkdir(path.dirname(reportPath), { recursive: true });
  await writeFile(reportPath, JSON.stringify(report, null, 2) + "\n", "utf8");
  return report;
}

async function buildFileList(root, storyDir) {
  return PIPELINE_FILES.map(([label, relativePath]) => {
    const filePath =
      label === "today.json"
        ? path.join(root, relativePath)
        : path.join(root, storyDir, relativePath);
    return {
      label,
      path: label === "today.json" ? relativePath : path.join(storyDir, relativePath).replaceAll("\\", "/"),
      exists: existsSync(filePath),
    };
  });
}

export async function POST() {
  try {
    const root = process.cwd();
    const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
    const summary = await runWorkflow(root);
    const manifestPath = path.join(root, summary.manifest);
    const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
    const health = await writeHealthReport(root, summary.story_dir, runId, summary.story_id);
    const files = await buildFileList(root, summary.story_dir);

    return NextResponse.json({
      run_id: runId,
      story_id: summary.story_id,
      status: manifest.status || summary.status,
      final_score: manifest.final_score ?? summary.final_score,
      story_dir: summary.story_dir,
      files,
      health,
      pipeline: {
        strategy: "success",
        idea: "success",
        outline: "success",
        writer: "success",
        qa: "success",
        rewrite: manifest.rewrite_round > 0 ? "success" : "pending",
        final: manifest.files?.final ? "success" : "failed",
        recorder: "success",
        health_check: "success",
      },
      data_source: `Real AI Execution Architecture ${process.env.STORY_FORGE_LLM_PROVIDER || "mock"} workflow with M3.1 mock health report`,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error.message,
      },
      { status: 500 },
    );
  }
}

const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { existsSync } = require("fs");
const { appendFile, copyFile, mkdir, readFile, readdir, writeFile } = require("fs/promises");
const path = require("path");

const PIPELINE_FILES = [
  ["idea.json", "idea.json"],
  ["outline.json", "outline.json"],
  ["draft.md", "draft.md"],
  ["final.md", "final.md"],
  ["summary.txt", "summary.txt"],
  ["meta.json", "meta.json"],
  ["story_manifest.json", "story_manifest.json"],
  ["execution_trace.json", "execution_trace.json"],
  ["pipeline_state.json", "pipeline_state.json"],
];

const PROVIDER_CONFIG = {
  mock: {
    keyEnv: null,
    defaultModel: "mock-model",
  },
  openai: {
    keyEnv: "OPENAI_API_KEY",
    modelEnv: "STORY_FORGE_OPENAI_MODEL",
    defaultModel: "gpt-5.5",
  },
  deepseek: {
    keyEnv: "DEEPSEEK_API_KEY",
    modelEnv: "STORY_FORGE_DEEPSEEK_MODEL",
    defaultModel: "deepseek-v4-flash",
  },
  claude: {
    keyEnv: "CLAUDE_API_KEY",
    modelEnv: "STORY_FORGE_CLAUDE_MODEL",
    defaultModel: "claude-provider-placeholder",
  },
};

function normalizeProviderName(value) {
  const provider = String(value || "mock").trim().toLowerCase();
  return PROVIDER_CONFIG[provider] ? provider : "mock";
}

function getRuntimeStatus() {
  const provider = normalizeProviderName(process.env.STORY_FORGE_LLM_PROVIDER);
  const config = PROVIDER_CONFIG[provider];
  const hasApiKey = config.keyEnv ? Boolean(process.env[config.keyEnv]) : false;
  const model = config.modelEnv ? process.env[config.modelEnv] || config.defaultModel : config.defaultModel;
  const mode = provider === "mock" ? "mock" : hasApiKey ? "api" : "missing_key";

  return {
    provider,
    mode,
    model,
    key_env: config.keyEnv,
    has_api_key: hasApiKey,
    api_enabled: mode === "api",
    label: mode === "api" ? `${provider} API Mode` : mode === "missing_key" ? `${provider} Missing Key` : "Mock Mode",
  };
}

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

function validateCount(value) {
  const count = Number(value ?? 1);
  if (!Number.isInteger(count)) throw new Error("本次生成故事数量必须为正整数。");
  if (count < 1 || count > 5) throw new Error("本次生成故事数量必须在 1 到 5 之间。");
  return count;
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

function runCommand(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd,
      shell: false,
      env: {
        ...process.env,
        PYTHONDONTWRITEBYTECODE: "1",
        PYTHONIOENCODING: "utf-8",
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

async function runPythonStore(root, args) {
  const script = path.join(root, "scripts", "dashboard_store.py");
  const errors = [];
  for (const command of pythonCandidates()) {
    try {
      const commandArgs = path.basename(command).toLowerCase() === "py"
        ? ["-3", script, "--root", root, ...args]
        : [script, "--root", root, ...args];
      const stdout = await runCommand(command, commandArgs, { cwd: root });
      return stdout ? JSON.parse(stdout) : {};
    } catch (error) {
      errors.push(`${command}: ${error.message}`);
    }
  }
  throw new Error(`Unable to run dashboard SQLite store. ${errors.join(" | ")}`);
}

async function initDashboardStore(root) {
  await runPythonStore(root, ["init"]);
}

async function startDashboardRun(root, rawCount) {
  const count = validateCount(rawCount);
  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  await initDashboardStore(root);
  await runPythonStore(root, ["create-run", "--run-id", runId, "--count", String(count)]);
  await mkdir(runDir(root, runId), { recursive: true });

  processDashboardRun(root, runId, count).catch(async (error) => {
    await appendRunError(root, runId, error);
    await runPythonStore(root, ["update-run", "--run-id", runId, "--status", "failed", "--error", error.message]);
  });

  return getDashboardState(root, runId);
}

async function processDashboardRun(root, runId, count) {
  const provider = process.env.STORY_FORGE_LLM_PROVIDER || "mock";
  const date = shanghaiDate();
  for (let index = 1; index <= count; index += 1) {
    const progressFile = progressPath(root, runId, index);
    await appendJsonLine(progressFile, {
      type: "story",
      story_index: index,
      status: "queued",
      timestamp: new Date().toISOString(),
    });
    try {
      const summary = await runWorkflow(root, date, provider, progressFile, index);
      await persistDashboardStory(root, runId, index, summary);
    } catch (error) {
      await appendJsonLine(progressFile, {
        type: "story",
        story_index: index,
        status: "failed",
        failure_reason: error.message,
        timestamp: new Date().toISOString(),
      });
      throw error;
    }
  }
  await runPythonStore(root, ["update-run", "--run-id", runId, "--status", "done"]);
}

async function runWorkflow(root, date, provider, progressFile, storyIndex) {
  const script = path.join(root, "scripts", "run_ai_execution.js");
  const errors = [];
  for (const command of nodeCandidates()) {
    try {
      const stdout = await runCommand(
        command,
        [
          script,
          `--date=${date}`,
          `--provider=${provider}`,
          `--progress-file=${progressFile}`,
          `--story-index=${storyIndex}`,
        ],
        { cwd: root },
      );
      return JSON.parse(stdout);
    } catch (error) {
      errors.push(`${command}: ${error.message}`);
    }
  }
  if (provider === "mock" && errors.some((message) => message.includes("EPERM"))) {
    return runInProcessMockWorkflow(root, date, progressFile, storyIndex);
  }
  throw new Error(`Unable to run Workflow Engine. ${errors.join(" | ")}`);
}

async function runInProcessMockWorkflow(root, date, progressFile, storyIndex) {
  const baseSlug = `dashboard-story-${String(storyIndex).padStart(3, "0")}`;
  const storyId = await uniqueSlug(path.join(root, "stories"), `${date}-${baseSlug}`);
  const slug = storyId.slice(date.length + 1);
  const storyDir = path.join(root, "stories", storyId);
  const storyDirRelative = path.relative(root, storyDir).replaceAll("\\", "/");
  await mkdir(storyDir, { recursive: true });
  await appendJsonLine(progressFile, {
    type: "story",
    story_id: storyId,
    story_index: storyIndex,
    story_dir: storyDirRelative,
    status: "running",
    timestamp: new Date().toISOString(),
  });

  const idea = {
    title: `仪表盘试运行故事 ${storyIndex}`,
    genre: "dashboard_validation",
    one_sentence_hook: "一个故事生产控制台在真实落盘状态中完成多篇流水线调度。",
    core_conflict: "控制台必须证明进度不是前端假动画而是来自文件和数据库。",
    protagonist: "Story Forge Dashboard",
    obstacle_or_antagonist: "受限 sandbox 中无法启动子进程写入 workflow 文件",
    twist_direction: "系统切换到进程内 mock workflow，仍然完成真实文件和 SQLite 双写。",
    viral_score: 78,
    slug,
  };
  const outline = {
    target_total_words: 300,
    chapter_count: 2,
    chapters: [
      {
        chapter_number: 1,
        target_words: 150,
        core_event: "Dashboard 启动 story pipeline 并持续写 progress event。",
        conflict: "状态必须可轮询、可恢复、可审计。",
        ending_hook: "首轮 QA 分数低于阈值。",
      },
      {
        chapter_number: 2,
        target_words: 150,
        core_event: "Rewrite 修复问题后再次 QA。",
        conflict: "故事产物必须同时写入文件系统与 SQLite。",
        ending_hook: "最终状态变为 Done。",
      },
    ],
    final_ending: "Dashboard 控制台完成真实落盘试运行。",
  };

  await runLocalStage(progressFile, storyId, "idea", 1, async () => {
    await writeJson(path.join(storyDir, "idea.json"), idea);
  });
  await runLocalStage(progressFile, storyId, "outline", 1, async () => {
    await writeJson(path.join(storyDir, "outline.json"), outline);
  });
  await runLocalStage(progressFile, storyId, "writer", 1, async () => {
    await writeFile(path.join(storyDir, "draft_v1.md"), "# Dashboard Draft v1\n\n控制台开始写入真实故事文件，并把每一步状态记录为 progress event。\n", "utf8");
  });
  await runLocalStage(progressFile, storyId, "qa", 1, async () => {
    await writeJson(path.join(storyDir, "qa_v1.json"), qaPayload(storyId, 1, "draft_v1.md", 82, "REWRITE"));
  }, "rewrite", 82);
  await runLocalStage(progressFile, storyId, "rewrite", 1, async () => {
    await writeFile(path.join(storyDir, "draft_v2.md"), "# Dashboard Draft v2\n\nRewrite 后，故事控制台完成真实文件、SQLite 与状态追踪的闭环。\n", "utf8");
  });
  await runLocalStage(progressFile, storyId, "qa", 2, async () => {
    await writeJson(path.join(storyDir, "qa_v2.json"), qaPayload(storyId, 2, "draft_v2.md", 90, "PASS"));
  }, "success", 90);
  await runLocalStage(progressFile, storyId, "final", 1, async () => {
    await copyFile(path.join(storyDir, "draft_v2.md"), path.join(storyDir, "final.md"));
  });

  const trace = await readProgressEvents(progressFile);
  const manifest = {
    story_id: storyId,
    date,
    slug,
    title: idea.title,
    genre: idea.genre,
    status: "passed",
    current_draft: `${storyDirRelative}/draft_v2.md`,
    current_qa: `${storyDirRelative}/qa_v2.json`,
    rewrite_round: 1,
    qa_round: 2,
    final_score: 90,
    pass_threshold: 85,
    files: {
      idea: `${storyDirRelative}/idea.json`,
      outline: `${storyDirRelative}/outline.json`,
      draft_v1: `${storyDirRelative}/draft_v1.md`,
      qa_v1: `${storyDirRelative}/qa_v1.json`,
      draft_v2: `${storyDirRelative}/draft_v2.md`,
      qa_v2: `${storyDirRelative}/qa_v2.json`,
      final: `${storyDirRelative}/final.md`,
    },
    agent_versions: {
      runtime: "dashboard-in-process-mock-v1",
      workflow_engine: "dashboard-in-process-mock-v1",
      llm_provider: "mock",
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await writeJson(path.join(storyDir, "story_manifest.json"), manifest);
  await writeJson(path.join(storyDir, "execution_trace.json"), trace);
  await writeJson(path.join(storyDir, "pipeline_state.json"), {
    current: "passed",
    rewrite_rounds: 1,
    state: {
      idea: "success",
      outline: "success",
      writer: "success",
      qa: "success",
      rewrite: "success",
      final: "success",
    },
    failure_reason: null,
    updated_at: new Date().toISOString(),
  });
  await writeFile(path.join(storyDir, "agent_io.jsonl"), "", "utf8");
  await appendJsonLine(progressFile, {
    type: "story",
    story_id: storyId,
    story_index: storyIndex,
    story_dir: storyDirRelative,
    status: "passed",
    final_score: 90,
    timestamp: new Date().toISOString(),
  });

  return {
    run_id: `run_${Date.now()}`,
    story_id: storyId,
    story_dir: storyDirRelative,
    manifest: `${storyDirRelative}/story_manifest.json`,
    final: `${storyDirRelative}/final.md`,
    status: "passed",
    final_score: 90,
    trace: `${storyDirRelative}/execution_trace.json`,
    state: `${storyDirRelative}/pipeline_state.json`,
    agent_io_log: `${storyDirRelative}/agent_io.jsonl`,
  };
}

async function runLocalStage(progressFile, storyId, stage, iteration, action, finalStatus = "success", score = null) {
  await appendJsonLine(progressFile, {
    type: "stage",
    story_id: storyId,
    stage,
    iteration,
    status: "running",
    timestamp: new Date().toISOString(),
  });
  await sleep(250);
  await action();
  await appendJsonLine(progressFile, {
    type: "stage",
    story_id: storyId,
    stage,
    iteration,
    status: finalStatus,
    score,
    timestamp: new Date().toISOString(),
  });
}

async function persistDashboardStory(root, runId, storyIndex, summary) {
  const sourceDir = path.join(root, summary.story_dir);
  const manifest = await readJson(path.join(root, summary.manifest));
  const idea = await readJson(path.join(sourceDir, "idea.json"));
  const finalText = await readText(path.join(sourceDir, "final.md"));
  const title = String(manifest.title || idea.title || summary.story_id);
  const status = summary.status === "passed" ? "done" : summary.status;
  const createdAt = manifest.created_at || new Date().toISOString();
  const summaryText = summarizeStory(idea, finalText);
  const canonicalDir = path.join(root, "stories", summary.story_id);

  await mkdir(canonicalDir, { recursive: true });
  await copyIfExists(path.join(sourceDir, "idea.json"), path.join(canonicalDir, "idea.json"));
  await copyIfExists(path.join(sourceDir, "outline.json"), path.join(canonicalDir, "outline.json"));
  await copyIfExists(path.join(sourceDir, "draft_v1.md"), path.join(canonicalDir, "draft.md"));
  await copyIfExists(path.join(sourceDir, "final.md"), path.join(canonicalDir, "final.md"));
  await copyIfExists(path.join(sourceDir, "story_manifest.json"), path.join(canonicalDir, "story_manifest.json"));
  await copyIfExists(path.join(sourceDir, "execution_trace.json"), path.join(canonicalDir, "execution_trace.json"));
  await copyIfExists(path.join(sourceDir, "pipeline_state.json"), path.join(canonicalDir, "pipeline_state.json"));
  await copyIfExists(path.join(sourceDir, "agent_io.jsonl"), path.join(canonicalDir, "agent_io.jsonl"));

  await writeFile(path.join(canonicalDir, "summary.txt"), `${summaryText}\n`, "utf8");
  const existingMeta = await readJson(path.join(canonicalDir, "meta.json"), true);
  const meta = {
    story_id: summary.story_id,
    created_at: createdAt,
    status,
    title,
    summary: summaryText,
    metrics: {
      read_count: Number(existingMeta?.metrics?.read_count ?? 0),
      drop_off_users: Number(existingMeta?.metrics?.drop_off_users ?? 0),
    },
    source_story_dir: summary.story_dir,
  };
  await writeFile(path.join(canonicalDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");

  await runPythonStore(root, [
    "upsert-story",
    "--payload",
    JSON.stringify({
      run_id: runId,
      story_index: storyIndex,
      story: {
        id: summary.story_id,
        title,
        summary: summaryText,
        created_at: createdAt,
        status,
        read_count: meta.metrics.read_count,
        drop_off_users: meta.metrics.drop_off_users,
      },
    }),
  ]);

  const events = await readProgressEvents(progressPath(root, runId, storyIndex));
  for (const event of events) {
    if (event.type === "stage" && event.status !== "running" && event.story_id) {
      await runPythonStore(root, [
        "add-log",
        "--story-id",
        event.story_id,
        "--stage",
        String(event.stage),
        "--iteration",
        String(event.iteration || 1),
        "--status",
        normalizeStageStatus(event.status),
        "--timestamp",
        event.timestamp || new Date().toISOString(),
      ]);
    }
  }
}

async function getDashboardState(root, runId) {
  await initDashboardStore(root);
  const storiesPayload = await runPythonStore(root, ["list-stories"]);
  const run = runId ? await runPythonStore(root, ["run", "--run-id", runId]) : null;
  const progressStories = runId ? await readRunProgress(root, runId, run?.requested_count || 0) : [];
  const completedById = new Map((run?.stories || []).map((story) => [story.id, story]));
  const mergedRunStories = progressStories.map((progressStory) => {
    const completed = progressStory.id ? completedById.get(progressStory.id) : null;
    return mergeStoryState(progressStory, completed);
  });

  return {
    runtime: getRuntimeStatus(),
    active_run: run
      ? {
          ...run,
          stories: mergedRunStories.length ? mergedRunStories : run.stories || [],
        }
      : null,
    stories: storiesPayload.stories || [],
  };
}

async function updateStoryMetrics(root, storyId, readCount, dropOffUsers) {
  const read_count = validateMetric(readCount, "read_count");
  const drop_off_users = validateMetric(dropOffUsers, "drop_off_users");
  await initDashboardStore(root);
  await runPythonStore(root, [
    "update-metrics",
    "--story-id",
    storyId,
    "--read-count",
    String(read_count),
    "--drop-off-users",
    String(drop_off_users),
  ]);
  const metaPath = path.join(root, "stories", storyId, "meta.json");
  const meta = await readJson(metaPath, true);
  if (meta) {
    meta.metrics = { read_count, drop_off_users };
    await writeFile(metaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  }
  return getStoryDetail(root, storyId);
}

async function getStoryDetail(root, storyId) {
  await initDashboardStore(root);
  const story = await runPythonStore(root, ["story", "--story-id", storyId]);
  const finalText = await readText(path.join(root, "stories", storyId, "final.md"));
  const meta = await readJson(path.join(root, "stories", storyId, "meta.json"), true);
  return {
    ...story,
    final_text: finalText,
    meta,
    files: fileList(root, `stories/${storyId}`),
  };
}

function mergeStoryState(progressStory, completed) {
  if (!completed) return progressStory;
  return {
    ...completed,
    story_index: progressStory.story_index,
    current_stage: progressStory.current_stage || "Done",
    pipeline_steps: progressStory.pipeline_steps.length ? progressStory.pipeline_steps : logsToSteps(completed.pipeline_logs || []),
    status: completed.status || progressStory.status,
  };
}

async function readRunProgress(root, runId, requestedCount) {
  const dir = runDir(root, runId);
  const stories = [];
  for (let index = 1; index <= requestedCount; index += 1) {
    const events = await readProgressEvents(progressPath(root, runId, index));
    stories.push(storyFromEvents(index, events));
  }
  return stories;
}

function storyFromEvents(index, events) {
  const storyEvents = events.filter((event) => event.type === "story");
  const stageEvents = events.filter((event) => event.type === "stage");
  const latestStory = storyEvents[storyEvents.length - 1] || {};
  const latestStage = stageEvents[stageEvents.length - 1] || null;
  const id = latestStory.story_id || stageEvents.find((event) => event.story_id)?.story_id || "";
  const status = mapStoryStatus(latestStory.status || latestStage?.status || "pending");
  return {
    id,
    story_index: index,
    title: id || `Story #${index}`,
    summary: "",
    created_at: latestStory.timestamp || "",
    status,
    current_stage: status === "done" ? "Done" : titleStage(latestStage?.stage || latestStory.status || "Pending"),
    pipeline_steps: eventsToSteps(stageEvents, status),
    read_count: 0,
    drop_off_users: 0,
  };
}

function eventsToSteps(events, storyStatus) {
  const ordered = [];
  const byKey = new Map();
  for (const event of events) {
    const key = `${event.stage}:${event.iteration || 1}`;
    if (!byKey.has(key)) {
      byKey.set(key, {
        stage: titleStage(event.stage),
        iteration: Number(event.iteration || 1),
        status: event.status,
      });
      ordered.push(byKey.get(key));
    } else {
      byKey.get(key).status = event.status;
    }
  }
  if (storyStatus === "done" && !ordered.some((step) => step.stage === "Done")) {
    ordered.push({ stage: "Done", iteration: 1, status: "success" });
  }
  return ordered;
}

function logsToSteps(logs) {
  return (logs || []).map((log) => ({
    stage: titleStage(log.stage),
    iteration: Number(log.iteration || 1),
    status: log.status,
  }));
}

async function readProgressEvents(filePath) {
  const text = await readText(filePath);
  return text
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      try {
        return JSON.parse(line);
      } catch {
        return null;
      }
    })
    .filter(Boolean);
}

async function readJson(filePath, optional = false) {
  try {
    return JSON.parse(await readFile(filePath, "utf8"));
  } catch (error) {
    if (optional) return null;
    throw error;
  }
}

async function readText(filePath) {
  try {
    return await readFile(filePath, "utf8");
  } catch {
    return "";
  }
}

async function copyIfExists(source, target) {
  if (!existsSync(source)) return;
  if (path.resolve(source).toLowerCase() === path.resolve(target).toLowerCase()) return;
  await mkdir(path.dirname(target), { recursive: true });
  await copyFile(source, target);
}

async function writeJson(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function appendJsonLine(filePath, value) {
  await mkdir(path.dirname(filePath), { recursive: true });
  await appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

async function appendRunError(root, runId, error) {
  await appendJsonLine(path.join(runDir(root, runId), "errors.jsonl"), {
    timestamp: new Date().toISOString(),
    error: error.message,
  });
}

function summarizeStory(idea, finalText) {
  const conflict = String(idea.core_conflict || "").replace(/\s+/g, "");
  const twist = String(idea.twist_direction || "").replace(/\s+/g, "");
  const fallback = finalText.replace(/[#*_`\s]/g, "");
  const text = `${conflict}${twist || fallback}` || "一个故事在冲突升级后迎来反转，并完成最终命运选择。";
  const normalized = text.replace(/[^\u4e00-\u9fa5]/g, "");
  if (normalized.length < 20) return "主角被迫面对核心冲突，并在最后一刻发现真正的反转真相。";
  return normalized.slice(0, 50);
}

function fileList(root, storyDir) {
  return PIPELINE_FILES.map(([label, relativePath]) => {
    const fullPath = path.join(root, storyDir, relativePath);
    return {
      label,
      path: path.join(storyDir, relativePath).replaceAll("\\", "/"),
      exists: existsSync(fullPath),
    };
  });
}

function normalizeStageStatus(status) {
  if (status === "rewrite") return "done";
  if (status === "success") return "done";
  return status || "done";
}

function mapStoryStatus(status) {
  if (status === "passed") return "done";
  if (status === "success") return "done";
  if (status === "queued") return "pending";
  return status || "pending";
}

function titleStage(stage) {
  const value = String(stage || "Pending");
  if (value === "qa") return "QA";
  return value.charAt(0).toUpperCase() + value.slice(1);
}

function validateMetric(value, label) {
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0) {
    throw new Error(`${label} must be a non-negative integer.`);
  }
  return number;
}

async function uniqueSlug(dayDir, baseSlug) {
  for (let index = 1; index < 100; index += 1) {
    const slug = index === 1 ? baseSlug : `${baseSlug}-${index}`;
    if (!existsSync(path.join(dayDir, slug))) return slug;
  }
  throw new Error("Unable to allocate dashboard story slug.");
}

function qaPayload(storyId, cycle, fileName, total, status) {
  return {
    story_id: storyId,
    evaluation_cycle: cycle,
    evaluated_file: fileName,
    final_scores: {
      opening_hook: status === "PASS" ? 18 : 16,
      conflict_strength: status === "PASS" ? 14 : 13,
      pacing: status === "PASS" ? 14 : 13,
      twist: status === "PASS" ? 9 : 8,
      emotional_payoff: status === "PASS" ? 14 : 12,
      ending: status === "PASS" ? 14 : 12,
      character_consistency: status === "PASS" ? 7 : 8,
      total,
    },
    status,
    rewrite_targets: status === "PASS"
      ? []
      : [
          {
            dimension: "dashboard_state",
            deduction_reason: "First QA intentionally requires rewrite for iteration tracking.",
            required_local_fix: "Run Rewrite(1), then QA(2).",
          },
        ],
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function runDir(root, runId) {
  return path.join(root, "metrics", "dashboard_runs", runId);
}

function progressPath(root, runId, storyIndex) {
  return path.join(runDir(root, runId), `story_${storyIndex}.jsonl`);
}

module.exports = {
  getDashboardState,
  getStoryDetail,
  getRuntimeStatus,
  initDashboardStore,
  startDashboardRun,
  updateStoryMetrics,
  validateCount,
};

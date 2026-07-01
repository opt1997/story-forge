const { createServer } = require("http");
const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { existsSync } = require("fs");
const { mkdir, readFile, writeFile } = require("fs/promises");
const path = require("path");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3100);

const pipelineFiles = [
  ["today.json", "planning/today.json"],
  ["idea.json", "idea.json"],
  ["outline.json", "outline.json"],
  ["draft_v1.md", "draft_v1.md"],
  ["qa_v1.json", "qa_v1.json"],
  ["draft_v2.md", "draft_v2.md"],
  ["qa_v2.json", "qa_v2.json"],
  ["final.md", "final.md"],
  ["story_manifest.json", "story_manifest.json"],
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

function runCommand(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
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

async function runWorkflow() {
  const date = shanghaiDate();
  const script = path.join(root, "scripts", "story_forge.py");
  const errors = [];
  for (const command of pythonCandidates()) {
    try {
      const args =
        path.basename(command).toLowerCase() === "py"
          ? ["-3", script, "start-today", "--date", date]
          : [script, "start-today", "--date", date];
      const stdout = await runCommand(command, args);
      return JSON.parse(stdout);
    } catch (error) {
      errors.push(`${command}: ${error.message}`);
    }
  }
  throw new Error(errors.join(" | "));
}

function makeHealth(runId, storyId) {
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
    data_source: "M3.1 preview mock health report",
  };
}

async function startToday() {
  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const summary = await runWorkflow();
  const manifest = JSON.parse(await readFile(path.join(root, summary.manifest), "utf8"));
  const health = makeHealth(runId, summary.story_id);
  const healthPath = path.join(root, summary.story_dir, "health_report.json");
  await mkdir(path.dirname(healthPath), { recursive: true });
  await writeFile(healthPath, `${JSON.stringify(health, null, 2)}\n`, "utf8");

  return {
    run_id: runId,
    story_id: summary.story_id,
    status: manifest.status || summary.status,
    final_score: manifest.final_score ?? summary.final_score,
    story_dir: summary.story_dir,
    files: pipelineFiles.map(([label, relativePath]) => {
      const filePath =
        label === "today.json"
          ? path.join(root, relativePath)
          : path.join(root, summary.story_dir, relativePath);
      return {
        label,
        path: label === "today.json" ? relativePath : path.join(summary.story_dir, relativePath).replaceAll("\\", "/"),
        exists: existsSync(filePath),
      };
    }),
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
  };
}

function html() {
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Story Forge Dashboard</title>
  <style>
    body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: #f7f5ef; color: #171717; }
    main { max-width: 1120px; margin: 0 auto; padding: 28px 20px; }
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; border-bottom: 1px solid #ded8cc; padding-bottom: 20px; }
    h1 { margin: 4px 0 0; font-size: 34px; }
    .eyebrow { color: #1f6b57; font-size: 13px; font-weight: 700; text-transform: uppercase; }
    button { height: 44px; border: 0; border-radius: 6px; padding: 0 20px; background: #171717; color: #fff; font-weight: 700; cursor: pointer; }
    button:disabled { background: #888; cursor: wait; }
    .grid { display: grid; gap: 16px; }
    .top { grid-template-columns: 1fr 2fr; margin-top: 22px; }
    .result { grid-template-columns: 1.1fr .9fr; margin-top: 16px; }
    .card { border: 1px solid #ded8cc; border-radius: 8px; background: #fff; padding: 16px; }
    .muted { color: #666; font-size: 13px; }
    .status { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-top: 12px; }
    .stage { border: 1px solid #ded8cc; border-radius: 8px; padding: 10px; }
    .stage.success { border-color: #1f6b57; color: #1f6b57; background: #edf8f4; }
    .stage.running { border-color: #b7791f; color: #8a570f; background: #fff8e8; }
    .stage.failed { border-color: #c65f46; color: #c65f46; background: #fff0ed; }
    .file { display: flex; justify-content: space-between; gap: 12px; border: 1px solid #ded8cc; border-radius: 8px; background: #f7f5ef; padding: 10px; margin-top: 8px; }
    .metric { border: 1px solid #ded8cc; border-radius: 8px; background: #f7f5ef; padding: 12px; margin-top: 10px; }
    .bar { height: 8px; background: #fff; border-radius: 99px; margin-top: 8px; overflow: hidden; }
    .bar span { display: block; height: 100%; background: #1f6b57; }
    code { overflow-wrap: anywhere; }
    @media (max-width: 760px) { header, .top, .result { display: block; } button { width: 100%; margin-top: 14px; } .card { margin-top: 14px; } .status { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <div class="eyebrow">M3.1 Dashboard Preview</div>
      <h1>Story Forge</h1>
    </div>
    <button id="start">开始今天创作</button>
  </header>
  <section class="grid top">
    <div class="card">
      <div class="muted">今日状态</div>
      <h2 id="today">pending</h2>
      <div id="error" style="color:#c65f46"></div>
    </div>
    <div class="card">
      <div class="muted">Pipeline</div>
      <div id="stages" class="status"></div>
    </div>
  </section>
  <section id="result"></section>
</main>
<script>
const stages = ["Strategy","Idea","Outline","Writer","QA","Rewrite","Final","Recorder","Health Check"];
const stageKeys = { "Strategy": "strategy", "Idea": "idea", "Outline": "outline", "Writer": "writer", "QA": "qa", "Rewrite": "rewrite", "Final": "final", "Recorder": "recorder", "Health Check": "health_check" };
let status = Object.fromEntries(stages.map(stage => [stage, "pending"]));
const stagesNode = document.getElementById("stages");
const resultNode = document.getElementById("result");
function renderStages() {
  stagesNode.innerHTML = stages.map(stage => '<div class="stage ' + status[stage] + '"><strong>' + stage + '</strong><br><span>' + status[stage] + '</span></div>').join("");
}
function renderResult(data) {
  resultNode.innerHTML = '<section class="grid result">' +
    '<div class="card"><div class="muted">Run Result</div>' +
    '<p><strong>run_id:</strong> <code>' + data.run_id + '</code></p>' +
    '<p><strong>story_id:</strong> <code>' + data.story_id + '</code></p>' +
    '<p><strong>status:</strong> ' + data.status + '</p>' +
    '<p><strong>final_score:</strong> ' + data.final_score + '</p>' +
    '<h3>生成文件</h3>' +
    data.files.map(file => '<div class="file"><div><strong>' + file.label + '</strong><br><code>' + file.path + '</code></div><strong>' + (file.exists ? 'exists' : 'missing') + '</strong></div>').join("") +
    '</div><div class="card"><div class="muted">System Health</div>' +
    metric("Workflow Score", data.health.scores.workflow) +
    metric("Data Flow Score", data.health.scores.data_flow) +
    metric("Agent Permission Score", data.health.scores.agent_permission) +
    metric("Metrics Integrity Score", data.health.scores.metrics_integrity) +
    '<p>Story Quality: ' + data.health.scores.story_quality + '/100</p>' +
    '<p>AI vs Human Gap: ' + data.health.scores.ai_vs_human_gap + ' 分</p>' +
    '<p>Prompt Drift: 无</p>' +
    '</div></section>';
}
function metric(label, value) {
  return '<div class="metric"><strong>' + label + '</strong><span style="float:right">' + value + '/100</span><div class="bar"><span style="width:' + value + '%"></span></div></div>';
}
document.getElementById("start").addEventListener("click", async () => {
  document.getElementById("start").disabled = true;
  document.getElementById("today").textContent = "running";
  document.getElementById("error").textContent = "";
  resultNode.innerHTML = "";
  status = Object.fromEntries(stages.map(stage => [stage, "pending"]));
  renderStages();
  let i = 0;
  const timer = setInterval(() => {
    status[stages[Math.min(i, stages.length - 1)]] = "running";
    if (i > 0) status[stages[i - 1]] = "success";
    i += 1;
    renderStages();
  }, 220);
  try {
    const response = await fetch("/api/start-today", { method: "POST" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Workflow failed");
    clearInterval(timer);
    for (const stage of stages) status[stage] = data.pipeline[stageKeys[stage]] || "success";
    renderStages();
    document.getElementById("today").textContent = data.status;
    renderResult(data);
  } catch (error) {
    clearInterval(timer);
    document.getElementById("today").textContent = "failed";
    document.getElementById("error").textContent = error.message;
  } finally {
    document.getElementById("start").disabled = false;
  }
});
renderStages();
</script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  try {
    if (request.method === "POST" && request.url === "/api/start-today") {
      const payload = await startToday();
      response.writeHead(200, { "content-type": "application/json; charset=utf-8" });
      response.end(JSON.stringify(payload));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html());
  } catch (error) {
    response.writeHead(500, { "content-type": "application/json; charset=utf-8" });
    response.end(JSON.stringify({ error: error.message }));
  }
});

server.listen(port, () => {
  console.log(`Story Forge M3.1 preview: http://localhost:${port}`);
});

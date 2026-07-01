const { createServer } = require("http");
const path = require("path");
const dashboard = require("./dashboard_runtime.js");

const root = path.resolve(__dirname, "..");
const port = Number(process.env.PORT || 3100);

function sendJson(response, status, payload) {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(payload));
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";
    request.on("data", (chunk) => {
      body += chunk.toString();
    });
    request.on("end", () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
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
    main { max-width: 1240px; margin: 0 auto; padding: 28px 20px; }
    header { display: flex; align-items: flex-end; justify-content: space-between; gap: 20px; border-bottom: 1px solid #ded8cc; padding-bottom: 20px; }
    h1 { margin: 4px 0 0; font-size: 34px; }
    h2 { margin: 0; font-size: 20px; }
    button { height: 40px; border: 1px solid #171717; border-radius: 6px; padding: 0 16px; background: #171717; color: #fff; font-weight: 700; cursor: pointer; }
    button.secondary { background: #fff; color: #171717; border-color: #ded8cc; }
    button:disabled { opacity: .55; cursor: wait; }
    input { height: 38px; border: 1px solid #ded8cc; border-radius: 6px; padding: 0 10px; font: inherit; }
    .eyebrow { color: #1f6b57; font-size: 13px; font-weight: 700; text-transform: uppercase; }
    .grid { display: grid; gap: 16px; }
    .top { grid-template-columns: 1.2fr .8fr; margin-top: 22px; }
    .card { border: 1px solid #ded8cc; border-radius: 8px; background: #fff; padding: 16px; }
    .muted { color: #666; font-size: 13px; }
    .story-row { display: grid; grid-template-columns: 140px 120px 1fr 90px; gap: 12px; align-items: center; border: 1px solid #ded8cc; border-radius: 8px; background: #f7f5ef; padding: 12px; margin-top: 10px; }
    .step { display: inline-flex; align-items: center; gap: 8px; margin: 3px 4px 3px 0; }
    .pill { border: 1px solid #ded8cc; border-radius: 999px; padding: 4px 8px; font-size: 12px; background: #fff; }
    .done { border-color: #1f6b57; color: #1f6b57; background: #edf8f4; }
    .running, .rewrite { border-color: #b7791f; color: #8a570f; background: #fff8e8; }
    .failed { border-color: #c65f46; color: #c65f46; background: #fff0ed; }
    .timeline { margin-top: 16px; }
    .timeline-item { border: 1px solid #ded8cc; border-radius: 8px; background: #f7f5ef; padding: 14px; margin-top: 10px; }
    .timeline-grid { display: grid; grid-template-columns: 1fr 170px 170px 90px; gap: 12px; align-items: start; }
    .summary { color: #444; font-size: 14px; margin: 8px 0 0; }
    .dialog { position: fixed; inset: 0; display: none; align-items: center; justify-content: center; background: rgba(0,0,0,.32); padding: 16px; }
    .dialog.open { display: flex; }
    .modal { width: min(380px, 100%); border-radius: 8px; background: #fff; padding: 20px; box-shadow: 0 20px 80px rgba(0,0,0,.18); }
    .actions { display: flex; justify-content: flex-end; gap: 8px; margin-top: 18px; }
    .error { margin-top: 14px; color: #c65f46; font-size: 14px; }
    pre { white-space: pre-wrap; max-height: 360px; overflow: auto; background: #fff; border: 1px solid #ded8cc; border-radius: 8px; padding: 12px; }
    @media (max-width: 840px) { header, .top, .story-row, .timeline-grid { display: block; } button { width: 100%; margin-top: 10px; } .card, .story-row, .timeline-item { margin-top: 12px; } }
  </style>
</head>
<body>
<main>
  <header>
    <div>
      <div class="eyebrow">Story Production Console</div>
      <h1>Story Forge</h1>
    </div>
    <button id="open-dialog">开始今天的创作</button>
  </header>
  <div id="error" class="error"></div>
  <section class="grid top">
    <div class="card">
      <div class="muted">当前运行</div>
      <h2 id="run-status">idle</h2>
      <div id="running-stories"></div>
    </div>
    <div class="card">
      <div class="muted">本地存储</div>
      <p><strong id="done-count">0</strong> completed stories</p>
      <p>SQLite: <code>metrics/story_forge.sqlite</code></p>
      <p>Source: progress + DB</p>
    </div>
  </section>
  <section class="card timeline">
    <div class="muted">已完成故事</div>
    <h2>时间轴</h2>
    <div id="timeline"></div>
  </section>
</main>

<div id="dialog" class="dialog">
  <div class="modal">
    <h2>开始今天的创作</h2>
    <label for="count">本次生成故事数量</label>
    <input id="count" value="1" inputmode="numeric" style="display:block;width:100%;margin-top:8px" />
    <div class="actions">
      <button class="secondary" id="cancel">取消</button>
      <button id="confirm">确认</button>
    </div>
  </div>
</div>

<script>
let activeRunId = "";
let pollTimer = null;
let dashboard = { active_run: null, stories: [] };
const errorNode = document.getElementById("error");
const dialog = document.getElementById("dialog");

document.getElementById("open-dialog").onclick = () => dialog.classList.add("open");
document.getElementById("cancel").onclick = () => dialog.classList.remove("open");
document.getElementById("confirm").onclick = startToday;

function cls(status) {
  if (status === "done" || status === "success") return "done";
  if (status === "running" || status === "rewrite") return "running";
  if (status === "failed") return "failed";
  return "";
}

function stepLabel(step) {
  if (!step) return "Pending";
  if (step.stage === "Done") return "Done";
  if (["Writer", "QA", "Rewrite"].includes(step.stage)) return step.stage + "(" + (step.iteration || 1) + ")";
  return step.stage;
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[char]));
}

async function fetchJson(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Request failed");
  return data;
}

async function refresh() {
  const suffix = activeRunId ? "?run_id=" + encodeURIComponent(activeRunId) : "";
  dashboard = await fetchJson("/api/dashboard" + suffix);
  if (dashboard.active_run && dashboard.active_run.status !== "running") {
    activeRunId = "";
    clearInterval(pollTimer);
    pollTimer = null;
  }
  render();
}

async function startToday() {
  const count = document.getElementById("count").value;
  errorNode.textContent = "";
  if (!/^\\d+$/.test(count) || Number(count) < 1 || Number(count) > 5) {
    errorNode.textContent = "故事数量必须是 1 到 5 的正整数。";
    return;
  }
  document.getElementById("confirm").disabled = true;
  try {
    dashboard = await fetchJson("/api/start-today", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ count: Number(count) })
    });
    activeRunId = dashboard.active_run?.id || "";
    dialog.classList.remove("open");
    if (pollTimer) clearInterval(pollTimer);
    pollTimer = setInterval(refresh, 1200);
    render();
  } catch (error) {
    errorNode.textContent = error.message;
  } finally {
    document.getElementById("confirm").disabled = false;
  }
}

async function saveMetrics(storyId) {
  const read = document.getElementById("read-" + storyId).value;
  const drop = document.getElementById("drop-" + storyId).value;
  try {
    await fetchJson("/api/story-metrics", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ story_id: storyId, read_count: Number(read), drop_off_users: Number(drop) })
    });
    await refresh();
  } catch (error) {
    errorNode.textContent = error.message;
  }
}

async function toggleStory(storyId) {
  const node = document.getElementById("detail-" + storyId);
  if (node.dataset.open === "1") {
    node.innerHTML = "";
    node.dataset.open = "0";
    return;
  }
  const detail = await fetchJson("/api/story?story_id=" + encodeURIComponent(storyId));
  node.dataset.open = "1";
  node.innerHTML = '<pre>' + escapeHtml(detail.final_text || "无正文") + '</pre>' +
    '<div>' + (detail.pipeline_logs || []).map(log => '<span class="pill done">' + escapeHtml(log.stage) + '(' + log.iteration + ')</span>').join(" ") + '</div>';
}

function render() {
  const run = dashboard.active_run;
  document.getElementById("run-status").textContent = run ? run.status : "idle";
  const running = document.getElementById("running-stories");
  running.innerHTML = (run?.stories || []).length ? run.stories.map((story, index) => {
    const steps = (story.pipeline_steps || []).map((step, stepIndex) =>
      '<span class="step"><span class="pill ' + cls(step.status) + '">' + escapeHtml(stepLabel(step)) + '</span>' +
      (stepIndex < story.pipeline_steps.length - 1 ? '<span>→</span>' : '') + '</span>'
    ).join("");
    return '<div class="story-row"><strong>Story #' + (story.story_index || index + 1) + '</strong>' +
      '<span class="pill ' + cls(story.status) + '">' + escapeHtml(story.current_stage || story.status) + '</span>' +
      '<div>' + (steps || '<span class="muted">Pending</span>') + '</div><span class="muted">' + escapeHtml(story.status) + '</span></div>';
  }).join("") : '<p class="muted" style="padding:24px;text-align:center">暂无运行中的故事</p>';

  const stories = (dashboard.stories || []).filter(story => story.status === "done");
  document.getElementById("done-count").textContent = stories.length;
  document.getElementById("timeline").innerHTML = stories.length ? stories.map(story =>
    '<article class="timeline-item"><div class="timeline-grid">' +
    '<button class="secondary" style="height:auto;text-align:left" onclick="toggleStory(\\'' + story.id + '\\')">' +
    '<strong>✔ ' + escapeHtml(story.title || story.id) + '</strong><p class="muted">' + escapeHtml(story.created_at || "") + '</p>' +
    '<p class="summary">' + escapeHtml(story.summary || "") + '</p></button>' +
    '<label class="muted">read_count<input id="read-' + story.id + '" value="' + Number(story.read_count || 0) + '" /></label>' +
    '<label class="muted">drop_off_users<input id="drop-' + story.id + '" value="' + Number(story.drop_off_users || 0) + '" /></label>' +
    '<button onclick="saveMetrics(\\'' + story.id + '\\')">保存</button></div><div id="detail-' + story.id + '"></div></article>'
  ).join("") : '<p class="muted" style="padding:24px;text-align:center">还没有完成故事</p>';
}

refresh().catch(error => { errorNode.textContent = error.message; });
</script>
</body>
</html>`;
}

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url, `http://localhost:${port}`);
    if (request.method === "POST" && url.pathname === "/api/start-today") {
      const body = await readBody(request);
      sendJson(response, 200, await dashboard.startDashboardRun(root, body.count ?? 1));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/dashboard") {
      sendJson(response, 200, await dashboard.getDashboardState(root, url.searchParams.get("run_id") || undefined));
      return;
    }
    if (request.method === "POST" && url.pathname === "/api/story-metrics") {
      const body = await readBody(request);
      sendJson(response, 200, await dashboard.updateStoryMetrics(root, body.story_id, body.read_count, body.drop_off_users));
      return;
    }
    if (request.method === "GET" && url.pathname === "/api/story") {
      sendJson(response, 200, await dashboard.getStoryDetail(root, url.searchParams.get("story_id")));
      return;
    }
    response.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    response.end(html());
  } catch (error) {
    sendJson(response, 500, { error: error.message });
  }
});

server.listen(port, () => {
  console.log(`Story Forge dashboard preview: http://localhost:${port}`);
});

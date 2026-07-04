const { spawn } = require("child_process");
const { randomUUID } = require("crypto");
const { existsSync } = require("fs");
const { appendFile, copyFile, mkdir, readFile, readdir, writeFile } = require("fs/promises");
const os = require("os");
const path = require("path");
const storyStrategy = require("./story_strategy.js");

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
    defaultModel: "deepseek-v4-pro",
  },
  claude: {
    keyEnv: "CLAUDE_API_KEY",
    modelEnv: "STORY_FORGE_CLAUDE_MODEL",
    defaultModel: "claude-provider-placeholder",
  },
};

const JSON_STORE_PATH = path.join("metrics", "dashboard_store.json");
const SEED_DATA_DIRS = ["planning", "knowledge", "stories", "agents"];
const TOPIC_POOL_COUNT = 30;
const TOPIC_DISPLAY_COUNT = 5;
const ACTIVE_TASK_CHILDREN = new Map();
const LIBRARY_PAGE_SIZE = 10;

const TOPIC_SEEDS = [
  {
    title: "被裁当天我接管了老板的直播间",
    title_variants: [
      "被踢出群聊后，公司订单全停了",
      "裁员直播三分钟后，老板求我别下播",
      "我关掉后台那晚，爆款账号断流了",
    ],
    genre: "都市逆袭",
    summary: "公开裁员后，主角用隐藏系统夺回直播间控制权。",
    tags: ["直播", "职场", "反转"],
    heat: 91,
    quality: 88,
    protagonist: "被低估的运营新人",
    antagonist: "抢功劳的上级和失控舆论",
    twist: "老板以为能封号，结果直播间权限早已绑定主角身份。",
  },
  {
    title: "替身合约到期后全城开始找我",
    title_variants: [
      "白月光回国那晚，我撤走了并购案",
      "离开签约席后，老爷子把公章递给我",
      "替身退场当天，豪门直播间崩盘了",
    ],
    genre: "豪门婚恋",
    summary: "合约替身退出豪门局，却成为唯一能救盘的人。",
    tags: ["替身", "豪门", "身份反转"],
    heat: 89,
    quality: 90,
    protagonist: "被迫签下替身协议的女主",
    antagonist: "把婚姻当生意的豪门继承人",
    twist: "真正能救项目的人不是白月光，而是被轻视的替身。",
  },
  {
    title: "末班地铁禁止回复第三条消息",
    title_variants: [
      "末班地铁上，我收到自己的求救短信",
      "十三号车厢里，不能叫出同伴的名字",
      "最后一站前，所有乘客都开始模仿我",
    ],
    genre: "规则怪谈",
    summary: "末班车里熟人接连求救，规则只允许回复一次。",
    tags: ["地铁", "规则", "悬疑"],
    heat: 86,
    quality: 87,
    protagonist: "加班到深夜的普通乘客",
    antagonist: "不断模仿熟人的未知乘客",
    twist: "真正被困住的不是主角，而是所有回过第三条消息的人。",
  },
  {
    title: "我停掉转账后全家开始审判我",
    title_variants: [
      "我取消亲情卡后，家族群开了审判直播",
      "母亲寿宴那天，我公开了三十七张欠条",
      "弟弟买房前夜，我把转账记录投上大屏",
    ],
    genre: "亲情撕裂",
    summary: "长期供养者停止无底线转账，亲属关系当场反噬。",
    tags: ["亲情", "现实", "清算"],
    heat: 84,
    quality: 86,
    protagonist: "长期供养家庭的长女",
    antagonist: "把牺牲视为理所当然的亲属",
    twist: "她公开所有债务和病历，真正欠债的人被推到镜头前。",
  },
  {
    title: "会议室里他们让我背锅",
    title_variants: [
      "客户到场前十分钟，我打开了同步日志",
      "事故复盘会上，我把录音接进了投屏",
      "他们让我签责任书，我递上了权限截图",
    ],
    genre: "职场爽文",
    summary: "产品事故当天，项目负责人用同步日志反杀甩锅者。",
    tags: ["职场", "证据", "公开打脸"],
    heat: 83,
    quality: 85,
    protagonist: "掌握关键日志的项目负责人",
    antagonist: "临时甩锅的管理层",
    twist: "客户代表正好在场，看见自动同步报告里的违规指令。",
  },
  {
    title: "退婚后我成了新规则的制定者",
    title_variants: [
      "退婚宴结束后，平台请我重写准入规则",
      "他撕掉婚约那刻，我拿到了行业白名单",
      "我离开订婚台，全场资本开始改口",
    ],
    genre: "女频爽文",
    summary: "退婚宴上被羞辱的人，反手拿到行业规则制定权。",
    tags: ["退婚", "创业", "爽点"],
    heat: 82,
    quality: 86,
    protagonist: "被退婚羞辱的创业者",
    antagonist: "用婚约交换资源的前未婚夫",
    twist: "她不是来求入场，而是被平台邀请来重写规则。",
  },
  {
    title: "养老院账本失踪的那一晚",
    title_variants: [
      "母亲旧收音机里，藏着养老院的黑账",
      "账本失踪那晚，院长删掉了第七层监控",
      "凌晨两点，我在护理站找到了假签名",
    ],
    genre: "现实悬疑",
    summary: "一份账本牵出养老骗局，主角必须在天亮前找回证据。",
    tags: ["养老", "骗局", "证据"],
    heat: 80,
    quality: 84,
    protagonist: "替母亲追账的普通女儿",
    antagonist: "披着公益外衣的机构负责人",
    twist: "账本没有丢，而是被母亲藏在所有人忽略的旧收音机里。",
  },
  {
    title: "AI替我写辞职信后老板慌了",
    title_variants: [
      "AI发出辞职信后，全公司流程瘫痪了",
      "老板说我能被替代，系统却只认我的指令",
      "我删除训练集那天，主管终于看懂了报表",
    ],
    genre: "职场逆袭",
    summary: "一封辞职信暴露公司真实依赖，普通员工获得谈判权。",
    tags: ["AI", "辞职", "谈判"],
    heat: 88,
    quality: 83,
    protagonist: "被算法低估的基层员工",
    antagonist: "把所有成果归给工具的老板",
    twist: "真正不可替代的不是工具，而是训练出流程的人。",
  },
  {
    title: "直播间第十分钟不能说真话",
    title_variants: [
      "直播到第十分钟，假货会自动封口",
      "我把真相拆成九分钟，品牌方慌了",
      "带货事故那晚，弹幕先说出了证据",
    ],
    genre: "直播舆论",
    summary: "带货事故中，主播发现第十分钟说真话会触发封禁。",
    tags: ["直播", "舆论", "规则"],
    heat: 85,
    quality: 82,
    protagonist: "临时救场的幕后运营",
    antagonist: "试图操控舆论的品牌方",
    twist: "主角提前把真相拆成十分钟前后的证据链，避开封禁规则。",
  },
  {
    title: "我被系统判定为无效继承人",
    title_variants: [
      "继承系统拉黑我后，家族资产开始自毁",
      "评分归零那天，我拿到了规则修复权",
      "他们改掉继承算法，却忘了我是管理员",
    ],
    genre: "系统流",
    summary: "继承资格被系统否决后，主角发现规则本身有漏洞。",
    tags: ["系统", "继承", "漏洞"],
    heat: 81,
    quality: 84,
    protagonist: "被家族系统排除的继承人",
    antagonist: "篡改评分规则的家族代理人",
    twist: "无效继承人反而拥有唯一的规则修复权限。",
  },
];

function isEphemeralRuntime() {
  return Boolean(
    process.env.NETLIFY
      || process.env.AWS_LAMBDA_FUNCTION_NAME
      || process.env.DEPLOY_ID
      || process.env.SITE_ID
      || process.env.URL
      || process.env.CONTEXT,
  );
}

function shouldUseJsonStore() {
  return process.env.STORY_FORGE_STORE === "json" || isEphemeralRuntime();
}

function runtimeDataRoot(root) {
  if (process.env.STORY_FORGE_DATA_ROOT) return process.env.STORY_FORGE_DATA_ROOT;
  if (isEphemeralRuntime()) return path.join(os.tmpdir(), "story-forge-dashboard");
  return root;
}

function storiesRoot(root) {
  return process.env.STORIES_ROOT || path.join(root, "stories");
}

async function prepareRuntimeRoot(root) {
  const dataRoot = runtimeDataRoot(root);
  if (path.resolve(dataRoot) === path.resolve(root)) return root;
  await mkdir(dataRoot, { recursive: true });
  for (const dir of SEED_DATA_DIRS) {
    await copyDirectoryMissing(path.join(root, dir), path.join(dataRoot, dir));
  }
  return dataRoot;
}

function normalizeProviderName(value) {
  const provider = String(value || "mock").trim().toLowerCase();
  return PROVIDER_CONFIG[provider] ? provider : "mock";
}

function configuredProviderName() {
  return getEnv("STORY_FORGE_LLM_PROVIDER") || (isEphemeralRuntime() ? "deepseek" : "mock");
}

function getRuntimeStatus() {
  const provider = normalizeProviderName(configuredProviderName());
  const config = PROVIDER_CONFIG[provider];
  const hasApiKey = config.keyEnv ? Boolean(getEnv(config.keyEnv)) : false;
  const model = config.modelEnv ? getEnv(config.modelEnv) || config.defaultModel : config.defaultModel;
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

function normalizeRunRequest(rawRequest) {
  const request = rawRequest && typeof rawRequest === "object" && !Array.isArray(rawRequest)
    ? rawRequest
    : { count: rawRequest };
  return {
    count: validateCount(request.count ?? 1),
    candidateId: normalizeOptionalText(request.candidate_id || request.candidateId),
    topicTitle: normalizeOptionalText(request.topic_title || request.topicTitle),
  };
}

function normalizeOptionalText(value) {
  const text = String(value || "").trim();
  return text ? text.slice(0, 160) : "";
}

function clampNumber(value, min, max, fallback) {
  const number = Number(value ?? fallback);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.round(number)));
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
    if (options.taskId) ACTIVE_TASK_CHILDREN.set(options.taskId, child);

    let stdout = "";
    let stderr = "";
    const cleanup = () => {
      if (options.taskId && ACTIVE_TASK_CHILDREN.get(options.taskId) === child) {
        ACTIVE_TASK_CHILDREN.delete(options.taskId);
      }
    };
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("error", (error) => {
      cleanup();
      reject(error);
    });
    child.on("close", (code) => {
      cleanup();
      if (code === 0) {
        resolve(stdout);
      } else {
        reject(new Error(stderr || `Command exited with code ${code}`));
      }
    });
  });
}

async function runPythonStore(root, args) {
  if (shouldUseJsonStore()) {
    return runJsonStore(root, args);
  }
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
  if (errors.every((message) => message.includes("ENOENT"))) {
    return runJsonStore(root, args);
  }
  throw new Error(`Unable to run dashboard SQLite store. ${errors.join(" | ")}`);
}

async function runJsonStore(root, args) {
  const [command, ...rawOptions] = args;
  const options = parseStoreOptions(rawOptions);
  const store = await readJsonStore(root);
  const timestamp = new Date().toISOString();

  if (command === "init") {
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "create-run") {
    store.runs[options.runId] = {
      id: options.runId,
      status: "running",
      requested_count: Number(options.count || 1),
      created_at: store.runs[options.runId]?.created_at || timestamp,
      updated_at: timestamp,
      error: null,
    };
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "update-run") {
    store.runs[options.runId] = {
      id: options.runId,
      status: options.status || "running",
      requested_count: Number(store.runs[options.runId]?.requested_count || 0),
      created_at: store.runs[options.runId]?.created_at || timestamp,
      updated_at: timestamp,
      error: options.error || null,
    };
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "upsert-story") {
    const payload = JSON.parse(options.payload || "{}");
    const story = payload.story || {};
    if (!story.id) throw new Error("story.id is required.");
    store.stories[story.id] = {
      id: story.id,
      title: story.title || story.id,
      summary: story.summary || "",
      created_at: story.created_at || timestamp,
      status: story.status || "running",
      final_text: story.final_text || store.stories[story.id]?.final_text || "",
      meta: story.meta || store.stories[story.id]?.meta || null,
      files: story.files || store.stories[story.id]?.files || [],
    };
    store.metrics[story.id] = {
      read_count: Number(store.metrics[story.id]?.read_count ?? story.read_count ?? 0),
      drop_off_users: Number(store.metrics[story.id]?.drop_off_users ?? story.drop_off_users ?? 0),
    };
    if (payload.run_id && payload.story_index !== undefined) {
      upsertJsonRunStory(store, payload.run_id, story.id, Number(payload.story_index));
    }
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "add-log") {
    store.logs.push({
      story_id: options.storyId,
      stage: options.stage,
      iteration: Number(options.iteration || 1),
      timestamp: options.timestamp || timestamp,
      status: options.status || "done",
    });
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "update-metrics") {
    store.metrics[options.storyId] = {
      read_count: Number(options.readCount || 0),
      drop_off_users: Number(options.dropOffUsers || 0),
    };
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "upsert-topic") {
    const topic = JSON.parse(options.payload || "{}");
    if (!topic.id) throw new Error("topic.id is required.");
    store.topics[topic.id] = {
      ...topic,
      tags: Array.isArray(topic.tags) ? topic.tags : [],
      created_at: topic.created_at || timestamp,
    };
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "list-topics") {
    return {
      topics: Object.values(store.topics)
        .filter((topic) => topic.date === options.date)
        .sort((a, b) => Number(b.quality_score || 0) - Number(a.quality_score || 0) || Number(b.heat_score || 0) - Number(a.heat_score || 0)),
    };
  }

  if (command === "clear-topics") {
    for (const [id, topic] of Object.entries(store.topics)) {
      if (topic.date === options.date) delete store.topics[id];
    }
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "story") {
    return jsonStory(store, options.storyId) || {};
  }

  if (command === "run") {
    return jsonRun(store, options.runId) || {};
  }

  if (command === "list-stories") {
    return { stories: listJsonStories(store) };
  }

  if (command === "list-runs") {
    return {
      runs: Object.values(store.runs)
        .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")))
        .slice(0, 30),
    };
  }

  if (command === "cancel-task") {
    store.cancelled_tasks[options.taskId] = {
      task_id: options.taskId,
      run_id: options.runId || "",
      story_index: Number(options.storyIndex || 0),
      story_id: options.storyId || "",
      cancelled_at: timestamp,
    };
    await writeJsonStore(root, store);
    return { ok: true };
  }

  if (command === "list-cancelled-tasks") {
    return { tasks: Object.values(store.cancelled_tasks) };
  }

  throw new Error(`Unknown dashboard store command: ${command}`);
}

function parseStoreOptions(args) {
  const options = {};
  for (let index = 0; index < args.length; index += 1) {
    const key = args[index];
    if (!key.startsWith("--")) continue;
    const name = key
      .slice(2)
      .replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    options[name] = args[index + 1] ?? true;
    index += 1;
  }
  return options;
}

async function readJsonStore(root) {
  const blobStore = await netlifyBlobStore();
  if (blobStore) {
    const payload = await blobStore.get("dashboard_store.json", { type: "json" });
    const store = normalizeJsonStore(payload);
    await hydrateJsonStoreFromFiles(root, store);
    return store;
  }
  const payload = await readJson(path.join(root, JSON_STORE_PATH), true);
  const store = normalizeJsonStore(payload);
  await hydrateJsonStoreFromFiles(root, store);
  return store;
}

async function writeJsonStore(root, store) {
  const blobStore = await netlifyBlobStore();
  if (blobStore) {
    await blobStore.setJSON("dashboard_store.json", normalizeJsonStore(store));
    return;
  }
  await writeJson(path.join(root, JSON_STORE_PATH), normalizeJsonStore(store));
}

async function netlifyBlobStore() {
  if (!isEphemeralRuntime() || process.env.STORY_FORGE_DISABLE_BLOBS === "1") return null;
  try {
    const { getStore } = await import("@netlify/blobs");
    return getStore({ name: "story-forge-dashboard", consistency: "strong" });
  } catch {
    return null;
  }
}

function normalizeJsonStore(payload = {}) {
  payload = payload || {};
  return {
    stories: payload.stories && typeof payload.stories === "object" ? payload.stories : {},
    metrics: payload.metrics && typeof payload.metrics === "object" ? payload.metrics : {},
    logs: Array.isArray(payload.logs) ? payload.logs : [],
    runs: payload.runs && typeof payload.runs === "object" ? payload.runs : {},
    run_stories: Array.isArray(payload.run_stories) ? payload.run_stories : [],
    topics: payload.topics && typeof payload.topics === "object" ? payload.topics : {},
    cancelled_tasks: payload.cancelled_tasks && typeof payload.cancelled_tasks === "object" ? payload.cancelled_tasks : {},
  };
}

async function hydrateJsonStoreFromFiles(root, store) {
  const metaFiles = await findNamedFiles(path.join(root, "stories"), "meta.json", 4);
  for (const metaPath of metaFiles) {
    const meta = await readJson(metaPath, true);
    if (!meta) continue;
    const storyId = meta.story_id || path.basename(path.dirname(metaPath));
    if (!storyId || store.stories[storyId]) continue;
    store.stories[storyId] = {
      id: storyId,
      title: meta.title || storyId,
      summary: meta.summary || "",
      created_at: meta.created_at || "",
      status: meta.status || "done",
    };
    store.metrics[storyId] = {
      read_count: Number(meta.metrics?.read_count || 0),
      drop_off_users: Number(meta.metrics?.drop_off_users || 0),
    };
  }
}

function upsertJsonRunStory(store, runId, storyId, storyIndex) {
  const existing = store.run_stories.find((row) => row.run_id === runId && row.story_id === storyId);
  if (existing) {
    existing.story_index = storyIndex;
    return;
  }
  store.run_stories.push({ run_id: runId, story_id: storyId, story_index: storyIndex });
}

function listJsonStories(store) {
  return Object.values(store.stories)
    .map((story) => ({
      ...story,
      read_count: Number(store.metrics[story.id]?.read_count || 0),
      drop_off_users: Number(store.metrics[story.id]?.drop_off_users || 0),
    }))
    .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || String(b.id).localeCompare(String(a.id)))
    .slice(0, 50);
}

function jsonStory(store, storyId) {
  const story = store.stories[storyId];
  if (!story) return null;
  return {
    ...story,
    read_count: Number(store.metrics[storyId]?.read_count || 0),
    drop_off_users: Number(store.metrics[storyId]?.drop_off_users || 0),
    pipeline_logs: store.logs.filter((log) => log.story_id === storyId),
  };
}

function jsonRun(store, runId) {
  const run = store.runs[runId];
  if (!run) return null;
  const stories = store.run_stories
    .filter((row) => row.run_id === runId)
    .sort((a, b) => Number(a.story_index || 0) - Number(b.story_index || 0))
    .map((row) => ({
      story_index: row.story_index,
      ...jsonStory(store, row.story_id),
    }))
    .filter((story) => story.id);
  return { ...run, stories };
}

async function initDashboardStore(root) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  await runPythonStore(runtimeRoot, ["init"]);
}

async function startDashboardRun(root, rawRequest) {
  const request = normalizeRunRequest(rawRequest);
  const { count } = request;
  const runtimeRoot = await prepareRuntimeRoot(root);
  const runId = `run_${Date.now()}_${randomUUID().slice(0, 8)}`;
  const date = shanghaiDate();
  await initDashboardStore(runtimeRoot);
  await ensureTodayStrategyForRun(runtimeRoot, date, count, request);
  await runPythonStore(runtimeRoot, ["create-run", "--run-id", runId, "--count", String(count)]);
  await mkdir(runDir(runtimeRoot, runId), { recursive: true });
  await writeRunOptions(runtimeRoot, runId, { ...request, date });

  if (isEphemeralRuntime()) {
    await seedQueuedRun(runtimeRoot, runId, count);
    await invokeEphemeralBackgroundRun(runId, count, date, request);
    return getDashboardState(runtimeRoot, runId, { skipProcessing: true });
  }

  processDashboardRun(runtimeRoot, runId, count, date, request).catch(async (error) => {
    await appendRunError(runtimeRoot, runId, error);
    await runPythonStore(runtimeRoot, ["update-run", "--run-id", runId, "--status", "failed", "--error", error.message]);
  });

  return getDashboardState(runtimeRoot, runId);
}

async function processDashboardRun(root, runId, count, date = shanghaiDate(), options = {}) {
  const provider = configuredProviderName();
  let cancelledCount = 0;
  for (let index = 1; index <= count; index += 1) {
    const taskId = `${runId}:${index}`;
    const progressFile = progressPath(root, runId, index);
    await appendJsonLine(progressFile, {
      type: "story",
      story_index: index,
      status: "queued",
      timestamp: new Date().toISOString(),
    });
    if (await isTaskCancelled(root, taskId)) {
      cancelledCount += 1;
      await appendCancelledProgress(progressFile, index);
      continue;
    }
    try {
      const summary = await runWorkflow(root, date, provider, progressFile, index, {
        ...storyOptionsForIndex(options, index),
        taskId,
      });
      if (await isTaskCancelled(root, taskId)) {
        cancelledCount += 1;
        await appendCancelledProgress(progressFile, index, summary?.story_id);
        continue;
      }
      await persistDashboardStory(root, runId, index, summary);
    } catch (error) {
      if (await isTaskCancelled(root, taskId)) {
        cancelledCount += 1;
        await appendCancelledProgress(progressFile, index);
        continue;
      }
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
  await runPythonStore(root, ["update-run", "--run-id", runId, "--status", cancelledCount === count ? "cancelled" : "done"]);
}

async function processDashboardRunSafely(root, runId, count, date = shanghaiDate(), options = {}) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  try {
    const savedOptions = await readRunOptions(runtimeRoot, runId);
    await processDashboardRun(runtimeRoot, runId, count, date, { ...savedOptions, ...options });
  } catch (error) {
    await appendRunError(runtimeRoot, runId, error);
    await runPythonStore(runtimeRoot, ["update-run", "--run-id", runId, "--status", "failed", "--error", error.message]);
    throw error;
  }
}

async function seedQueuedRun(root, runId, count) {
  for (let index = 1; index <= count; index += 1) {
    const progressFile = progressPath(root, runId, index);
    const existing = await readProgressEvents(progressFile);
    if (existing.length) continue;
    await appendJsonLine(progressFile, {
      type: "story",
      story_index: index,
      status: "queued",
      timestamp: new Date().toISOString(),
    });
  }
}

async function ensureTodayStrategyForRun(root, date, count, request) {
  const todayTopics = await getTodayTopics(root);
  if (todayTopics.date === date && !request.candidateId) {
    return storyStrategy.readTodayStrategy(root);
  }
  if (request.candidateId) {
    const existing = await storyStrategy.readTodayStrategy(root);
    const pools = [
      existing?.selected_top_n,
      existing?.ranking?.ranked_candidates,
      existing?.topic_candidates,
    ].filter(Array.isArray);
    const hasCandidate = existing?.date === date
      && pools.some((candidates) => candidates.some((candidate) => candidate?.candidate_id === request.candidateId));
    if (hasCandidate) return existing;
  }
  return storyStrategy.readTodayStrategy(root) || storyStrategy.buildTodayStrategy(root, { date, targetCount: count });
}

function storyOptionsForIndex(options, storyIndex) {
  if (storyIndex !== 1) return {};
  return {
    candidateId: options.candidateId || options.candidate_id || "",
    topicTitle: options.topicTitle || options.topic_title || "",
  };
}

async function writeRunOptions(root, runId, options) {
  await writeJson(path.join(runDir(root, runId), "options.json"), options);
}

async function readRunOptions(root, runId) {
  return (await readJson(path.join(runDir(root, runId), "options.json"), true)) || {};
}

async function getTodayTopics(root, options = {}) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  await initDashboardStore(runtimeRoot);
  const date = shanghaiDate();
  const limit = clampNumber(options.limit, 1, TOPIC_POOL_COUNT, TOPIC_DISPLAY_COUNT);
  let topics = (await runPythonStore(runtimeRoot, ["list-topics", "--date", date])).topics || [];
  if (topics.length < TOPIC_POOL_COUNT) {
    const existingIds = new Set(topics.map((topic) => topic.id));
    const generated = buildTopicCandidates(date, "mock")
      .filter((topic) => !existingIds.has(topic.id))
      .slice(0, TOPIC_POOL_COUNT - topics.length);
    for (const topic of generated) {
      await runPythonStore(runtimeRoot, ["upsert-topic", "--payload", JSON.stringify(topic)]);
    }
    topics = (await runPythonStore(runtimeRoot, ["list-topics", "--date", date])).topics || [];
  }
  await writeTopicPlan(runtimeRoot, date, topics);
  return {
    date,
    source: topics[0]?.source || "mock",
    generated_count: topics.length,
    display_count: Math.min(limit, topics.length),
    topics: topics.slice(0, limit),
  };
}

function parseTaskId(taskId) {
  const [runId, storyIndexText] = String(taskId || "").split(":");
  const storyIndex = Number(storyIndexText || 0);
  return {
    runId: runId || "",
    storyIndex: Number.isInteger(storyIndex) && storyIndex > 0 ? storyIndex : 0,
  };
}

async function isTaskCancelled(root, taskId) {
  const cancelledTasks = (await runPythonStore(root, ["list-cancelled-tasks"])).tasks || [];
  return cancelledTasks.some((task) => task.task_id === taskId);
}

async function appendCancelledProgress(progressFile, storyIndex, storyId = "") {
  await appendJsonLine(progressFile, {
    type: "story",
    story_id: storyId || undefined,
    story_index: storyIndex,
    status: "cancelled",
    timestamp: new Date().toISOString(),
  });
}

async function refreshTodayTopics(root, options = {}) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  await initDashboardStore(runtimeRoot);
  const date = shanghaiDate();
  const limit = clampNumber(options.limit, 1, TOPIC_POOL_COUNT, TOPIC_DISPLAY_COUNT);
  await runPythonStore(runtimeRoot, ["clear-topics", "--date", date]);
  const topics = buildTopicCandidates(date, "mock", Date.now());
  for (const topic of topics) {
    await runPythonStore(runtimeRoot, ["upsert-topic", "--payload", JSON.stringify(topic)]);
  }
  const savedTopics = (await runPythonStore(runtimeRoot, ["list-topics", "--date", date])).topics || [];
  await writeTopicPlan(runtimeRoot, date, savedTopics);
  return {
    date,
    source: savedTopics[0]?.source || "mock",
    generated_count: savedTopics.length,
    display_count: Math.min(limit, savedTopics.length),
    topics: savedTopics.slice(0, limit),
  };
}

function buildTopicCandidates(date, source, refreshSeed = "") {
  const createdAt = new Date().toISOString();
  const modes = [
    { variant: 0, heat: 0, quality: 0, tag: "主推" },
    { variant: 1, heat: -2, quality: 1, tag: "强钩子" },
    { variant: 2, heat: 1, quality: -1, tag: "高反转" },
  ];
  return Array.from({ length: TOPIC_POOL_COUNT }, (_, index) => {
    const seed = TOPIC_SEEDS[index % TOPIC_SEEDS.length];
    const mode = modes[Math.floor(index / TOPIC_SEEDS.length) % modes.length];
    const sequence = index + 1;
    const variants = Array.isArray(seed.title_variants) && seed.title_variants.length ? seed.title_variants : [seed.title];
    const title = variants[mode.variant % variants.length];
    return {
      id: `${date}-topic-${String(sequence).padStart(2, "0")}`,
      date,
      seed_title: seed.title,
      title,
      genre: seed.genre,
      summary: seed.summary,
      heat_score: Math.max(1, Math.min(100, seed.heat + mode.heat - Math.floor(index / 10))),
      quality_score: Math.max(1, Math.min(100, seed.quality + mode.quality - Math.floor(index / 12))),
      tags: [...seed.tags, mode.tag],
      source,
      refresh_seed: String(refreshSeed || ""),
      created_at: createdAt,
    };
  });
}

function topicToCandidate(topic, rank = 1) {
  const seed = TOPIC_SEEDS.find((item) => (
    item.title === topic.seed_title
    || item.title === topic.title
    || (Array.isArray(item.title_variants) && item.title_variants.includes(topic.title))
  )) || {};
  const title = topic.title || `今日主题 ${rank}`;
  return {
    candidate_id: topic.id,
    working_title: title,
    slug: slugifyText(title, `topic-${rank}`),
    genre: topic.genre || seed.genre || "都市逆袭",
    theme: topic.summary || seed.summary || "强冲突反转题材",
    type: topic.genre || seed.genre || "都市逆袭",
    target_audience: `${topic.genre || seed.genre || "爽文"}读者`,
    trend_signals: topic.tags || [],
    hotness_basis: `${(topic.tags || []).join(" / ") || "本地推荐"} / heat ${topic.heat_score || 80} / ${topic.source || "mock"}`,
    commercial_angle: topic.summary || seed.summary || "高冲突、高反转、强代入题材",
    priority: rank,
    core_conflict: seed.summary || topic.summary || "主角被公开压迫后发现关键反击机会。",
    protagonist: seed.protagonist || "被低估的主角",
    obstacle_or_antagonist: seed.antagonist || "试图夺走资源的对手",
    twist_direction: seed.twist || "真正掌握规则的人在最后一刻反转局面。",
    monetization_hook: "前三百字给压力，中段连续打脸，结尾兑现身份或资源反转。",
    writing_skill: {
      skill_id: "instant-pressure-opening",
      label: "前三百字压迫开局",
      agent: "writer",
      use_when: [topic.genre || seed.genre || "都市逆袭"],
      guidance: "开头直接给羞辱、损失、倒计时或公开审判，避免慢热铺垫。",
    },
    scores: {
      innovation: Number(topic.quality_score || 84),
      conflict: 82,
      twist: 82,
      platform_fit: 84,
      hook: 86,
      emotion: 80,
      trend_heat: Number(topic.heat_score || 80),
      feedback_bonus: 0,
      diversity_bonus: 4,
      repetition_penalty: 0,
      total: Math.round((Number(topic.quality_score || 84) + Number(topic.heat_score || 80)) / 2),
    },
    rank,
  };
}

async function writeTopicPlan(root, date, topics) {
  const ranked = topics.slice(0, TOPIC_POOL_COUNT).map(topicToCandidate);
  const existing = await storyStrategy.readTodayStrategy(root);
  if (existing?.date === date && sameCandidateIds(existing.topic_candidates, ranked)) return existing;
  const plan = {
    ...(existing && existing.date === date ? existing : {}),
    date,
    status: "topics_ready",
    target_story_count: 1,
    topic_candidates: ranked,
    ranking: {
      ...(existing?.date === date ? existing.ranking : {}),
      ranked_candidates: ranked,
    },
    selected_top_n: ranked,
    updated_at: new Date().toISOString(),
  };
  await writeJson(path.join(root, "planning", "today.json"), plan);
  return plan;
}

function sameCandidateIds(left = [], right = []) {
  if (!Array.isArray(left) || left.length < right.length) return false;
  return right.every((candidate, index) => left[index]?.candidate_id === candidate.candidate_id);
}

function slugifyText(value, fallback) {
  const ascii = String(value || "")
    .normalize("NFKD")
    .replace(/[^\w\s-]/g, "")
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, "-")
    .replace(/-+/g, "-")
    .slice(0, 30);
  return ascii || fallback;
}

async function processEphemeralRunIfNeeded(root, run) {
  if (!isEphemeralRuntime() || !run || run.status !== "running") return;
  const lockPath = path.join(runDir(root, run.id), "processing.lock");
  if (existsSync(lockPath)) return;
  await writeFile(lockPath, new Date().toISOString(), "utf8");
  try {
    const savedOptions = await readRunOptions(root, run.id);
    await processDashboardRun(root, run.id, Number(run.requested_count || 1), savedOptions.date || shanghaiDate(), savedOptions);
  } catch (error) {
    await appendRunError(root, run.id, error);
    await runPythonStore(root, ["update-run", "--run-id", run.id, "--status", "failed", "--error", error.message]);
  }
}

async function invokeEphemeralBackgroundRun(runId, count, date, options = {}) {
  const siteUrl = getEnv("URL")
    || getEnv("DEPLOY_PRIME_URL")
    || getEnv("DEPLOY_URL")
    || "https://story-forge-dashboard-ltong-20260702.netlify.app";
  if (!siteUrl) return;
  try {
    const url = `${siteUrl.replace(/\/$/, "")}/.netlify/functions/process-run`;
    console.log(JSON.stringify({ event: "invoke-background-run", runId, url }));
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        run_id: runId,
        count,
        date,
        candidate_id: options.candidateId,
        topic_title: options.topicTitle,
      }),
    });
    console.log(JSON.stringify({ event: "invoke-background-run-response", runId, status: response.status }));
  } catch (error) {
    console.error(`Unable to invoke background run ${runId}: ${error.message}`);
  }
}

async function runWorkflow(root, date, provider, progressFile, storyIndex, options = {}) {
  if (isEphemeralRuntime() && provider === "deepseek") {
    return runInProcessDeepSeekWorkflow(root, date, progressFile, storyIndex, options);
  }
  if (isEphemeralRuntime() && provider === "mock") {
    return runInProcessMockWorkflow(root, date, progressFile, storyIndex, options);
  }
  const script = path.join(root, "scripts", "run_ai_execution.js");
  const errors = [];
  for (const command of nodeCandidates()) {
    try {
      const args = [
        script,
        `--date=${date}`,
        `--provider=${provider}`,
        `--progress-file=${progressFile}`,
        `--story-index=${storyIndex}`,
      ];
      if (options.candidateId) args.push(`--candidate-id=${options.candidateId}`);
      const stdout = await runCommand(
        command,
        args,
        { cwd: root, taskId: options.taskId },
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

async function runInProcessDeepSeekWorkflow(root, date, progressFile, storyIndex, options = {}) {
  const { candidate } = await storyStrategy.selectCandidateForStory(root, date, storyIndex, options);
  const baseSlug = candidate.slug || `dashboard-story-${String(storyIndex).padStart(3, "0")}`;
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

  let pack;
  await runLocalStage(progressFile, storyId, "deepseek", 1, async () => {
    pack = await generateDeepSeekStoryPack(storyId, slug, candidate);
  });

  const idea = normalizeDeepSeekIdea(pack?.idea, candidate, slug);
  const outline = normalizeDeepSeekOutline(pack?.outline, candidate);
  const finalText = buildDeepSeekFinalText(pack, idea, candidate);
  const draft = finalText;
  const qa = normalizeDeepSeekQa(pack?.qa_v1 || pack?.qa, storyId, "final.md");
  const finalScore = Number(qa.final_scores?.total || 90);
  const status = finalScore >= 90 ? "passed" : "needs_human_review";

  await runLocalStage(progressFile, storyId, "idea", 1, async () => {
    await writeJson(path.join(storyDir, "idea.json"), idea);
  });
  await runLocalStage(progressFile, storyId, "outline", 1, async () => {
    await writeJson(path.join(storyDir, "outline.json"), outline);
  });
  await runLocalStage(progressFile, storyId, "writer", 1, async () => {
    await writeFile(path.join(storyDir, "draft_v1.md"), draft, "utf8");
  });
  await runLocalStage(progressFile, storyId, "qa", 1, async () => {
    await writeJson(path.join(storyDir, "qa_v1.json"), qa);
  }, status === "passed" ? "success" : "failed", finalScore);
  if (status === "passed") {
    await runLocalStage(progressFile, storyId, "final", 1, async () => {
      await writeFile(path.join(storyDir, "final.md"), finalText, "utf8");
    });
  }

  const trace = await readProgressEvents(progressFile);
  const files = {
    idea: `${storyDirRelative}/idea.json`,
    outline: `${storyDirRelative}/outline.json`,
    draft_v1: `${storyDirRelative}/draft_v1.md`,
    qa_v1: `${storyDirRelative}/qa_v1.json`,
  };
  if (status === "passed") files.final = `${storyDirRelative}/final.md`;

  const manifest = {
    story_id: storyId,
    date,
    slug,
    title: idea.title,
    genre: idea.genre,
    status,
    current_draft: `${storyDirRelative}/draft_v1.md`,
    current_qa: `${storyDirRelative}/qa_v1.json`,
    rewrite_round: 0,
    qa_round: 1,
    final_score: finalScore,
    pass_threshold: 90,
    files,
    planning: {
      today: "planning/today.json",
      candidate_id: candidate.candidate_id,
      rank: candidate.rank,
      hotness_basis: candidate.hotness_basis,
      writing_skill: candidate.writing_skill,
    },
    agent_versions: {
      runtime: "dashboard-netlify-deepseek-pack-v1",
      workflow_engine: "dashboard-netlify-deepseek-pack-v1",
      llm_provider: "deepseek",
      model: deepSeekModelFor("writer"),
    },
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
  await writeJson(path.join(storyDir, "story_manifest.json"), manifest);
  await writeJson(path.join(storyDir, "execution_trace.json"), trace);
  await writeJson(path.join(storyDir, "pipeline_state.json"), {
    current: status,
    rewrite_rounds: 0,
    state: {
      idea: "success",
      outline: "success",
      writer: "success",
      qa: status === "passed" ? "success" : "failed",
      rewrite: "pending",
      final: status === "passed" ? "success" : "pending",
    },
    failure_reason: status === "passed" ? null : "DeepSeek QA score is below threshold.",
    updated_at: new Date().toISOString(),
  });
  await writeFile(path.join(storyDir, "agent_io.jsonl"), `${JSON.stringify({
    timestamp: new Date().toISOString(),
    provider: "deepseek",
    model: deepSeekModelFor("writer"),
    story_id: storyId,
    mode: "netlify-story-pack",
  })}\n`, "utf8");
  await appendJsonLine(progressFile, {
    type: "story",
    story_id: storyId,
    story_index: storyIndex,
    story_dir: storyDirRelative,
    status,
    final_score: finalScore,
    timestamp: new Date().toISOString(),
  });

  return {
    run_id: `run_${Date.now()}`,
    story_id: storyId,
    story_dir: storyDirRelative,
    manifest: `${storyDirRelative}/story_manifest.json`,
    final: status === "passed" ? `${storyDirRelative}/final.md` : null,
    status,
    final_score: finalScore,
    trace: `${storyDirRelative}/execution_trace.json`,
    state: `${storyDirRelative}/pipeline_state.json`,
    agent_io_log: `${storyDirRelative}/agent_io.jsonl`,
  };
}

async function generateDeepSeekStoryPack(storyId, slug, candidate) {
  const apiKey = deepSeekApiKey();
  const model = deepSeekModelFor("writer");
  const body = {
    model,
    messages: [
      {
        role: "system",
        content: [
          "You are Story Forge running in a Netlify test environment.",
          "Return only valid JSON. Do not wrap it in markdown.",
          "Write all reader-facing story content in Simplified Chinese.",
          "Create a very short commercial web-fiction seed quickly.",
          "The title must be unique and specific: include a concrete scene, object, timestamp, evidence, or action.",
          "Do not create title variants by appending words like 反击版, 反差版, 上, 下, 续, or numbers.",
        ].join("\n"),
      },
      {
        role: "user",
        content: JSON.stringify({
          story_id: storyId,
          slug,
          candidate: {
            working_title: candidate.working_title,
            genre: candidate.genre,
            theme: candidate.theme,
            type: candidate.type,
            core_conflict: candidate.core_conflict,
            protagonist: candidate.protagonist,
            obstacle_or_antagonist: candidate.obstacle_or_antagonist,
            twist_direction: candidate.twist_direction,
            commercial_angle: candidate.commercial_angle,
            monetization_hook: candidate.monetization_hook,
            writing_skill: candidate.writing_skill,
          },
          required_shape: {
            idea: {
              title: "Unique Simplified Chinese title with a concrete scene/object/action, not a generic variant.",
              one_sentence_hook: "string",
            },
            opening_line: "One punchy Simplified Chinese opening sentence.",
            twist_line: "One punchy Simplified Chinese reversal sentence.",
          },
        }),
      },
    ],
    stream: false,
    temperature: 0.75,
    max_tokens: Number(getEnv("DEEPSEEK_MAX_TOKENS") || 240),
  };

  if (getEnv("DEEPSEEK_THINKING_TYPE")) {
    body.thinking = { type: getEnv("DEEPSEEK_THINKING_TYPE") };
  }
  if (getEnv("DEEPSEEK_REASONING_EFFORT")) {
    body.reasoning_effort = getEnv("DEEPSEEK_REASONING_EFFORT");
  }

  const response = await fetch(`${deepSeekBaseUrl()}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(Number(getEnv("DEEPSEEK_TIMEOUT_MS") || 50000)),
  });
  const payload = await responseJson(response);
  if (!response.ok) {
    throw new Error(`DeepSeek API failed (${response.status}): ${deepSeekError(payload)}`);
  }
  const content = String(payload?.choices?.[0]?.message?.content || "").trim();
  if (!content) {
    throw new Error("DeepSeek API returned no message content.");
  }
  try {
    return parseJsonContent(content, "deepseek story pack");
  } catch (error) {
    return {
      idea: {
        title: candidate.working_title || slug,
        one_sentence_hook: content.slice(0, 120),
      },
      opening_line: content.slice(0, 160),
      twist_line: candidate.twist_direction || "",
      parse_warning: error.message,
    };
  }
}

function deepSeekApiKey() {
  const value = getEnv("DEEPSEEK_API_KEY");
  if (!value) throw new Error("DEEPSEEK_API_KEY is required when provider=deepseek.");
  return value;
}

function deepSeekBaseUrl() {
  return String(getEnv("DEEPSEEK_BASE_URL") || "https://api.deepseek.com").replace(/\/$/, "");
}

function deepSeekModelFor(agent) {
  const upper = String(agent || "default").toUpperCase();
  return String(
    getEnv(`STORY_FORGE_DEEPSEEK_${upper}_MODEL`)
      || getEnv("STORY_FORGE_DEEPSEEK_MODEL")
      || "deepseek-v4-pro",
  );
}

function getEnv(name) {
  return process.env[name] || globalThis.Netlify?.env?.get?.(name) || "";
}

async function responseJson(response) {
  const text = await response.text();
  if (!text) return {};
  try {
    return JSON.parse(text);
  } catch {
    return { error: { message: text } };
  }
}

function deepSeekError(payload) {
  return String(payload?.error?.message || payload?.message || "unknown error");
}

function parseJsonContent(content, label) {
  const stripped = stripCodeFence(String(content || "").trim());
  const start = stripped.indexOf("{");
  const end = stripped.lastIndexOf("}");
  const jsonText = start >= 0 && end > start ? stripped.slice(start, end + 1) : stripped;
  try {
    const parsed = JSON.parse(jsonText);
    if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed;
  } catch (error) {
    throw new Error(`${label} returned invalid JSON: ${error.message}`);
  }
  throw new Error(`${label} returned JSON that is not an object.`);
}

function stripCodeFence(value) {
  const fenced = value.match(/^```(?:json|markdown|md)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1].trim() : value;
}

function normalizeDeepSeekIdea(raw, candidate, slug) {
  const idea = raw && typeof raw === "object" ? raw : {};
  return {
    title: String(idea.title || candidate.working_title || slug),
    genre: String(idea.genre || candidate.genre || ""),
    theme: String(idea.theme || candidate.theme || ""),
    type: String(idea.type || candidate.type || ""),
    one_sentence_hook: String(idea.one_sentence_hook || `${candidate.commercial_angle || ""} ${candidate.core_conflict || ""}`).trim(),
    core_conflict: String(idea.core_conflict || candidate.core_conflict || ""),
    protagonist: String(idea.protagonist || candidate.protagonist || ""),
    obstacle_or_antagonist: String(idea.obstacle_or_antagonist || candidate.obstacle_or_antagonist || ""),
    twist_direction: String(idea.twist_direction || candidate.twist_direction || ""),
    viral_score: Number(idea.viral_score || candidate.scores?.total || 90),
    hotness_basis: idea.hotness_basis || candidate.hotness_basis,
    writing_skill: idea.writing_skill || candidate.writing_skill,
    slug,
  };
}

function normalizeDeepSeekOutline(raw, candidate) {
  const outline = raw && typeof raw === "object" ? raw : {};
  const chapters = Array.isArray(outline.chapters) && outline.chapters.length
    ? outline.chapters
    : [
        {
          chapter_number: 1,
          target_words: 300,
          core_event: candidate.core_conflict || "Opening conflict escalates.",
          conflict: candidate.obstacle_or_antagonist || "The opponent presses the advantage.",
          ending_hook: candidate.twist_direction || "A reversal appears.",
        },
      ];
  return {
    target_total_words: Number(outline.target_total_words || 900),
    chapter_count: Number(outline.chapter_count || chapters.length),
    chapters,
    final_ending: String(outline.final_ending || candidate.monetization_hook || ""),
  };
}

function normalizeDeepSeekQa(raw, storyId, evaluatedFile) {
  const qa = raw && typeof raw === "object" ? raw : {};
  const scores = qa.final_scores && typeof qa.final_scores === "object" ? qa.final_scores : {};
  const total = clampScore(Number(scores.total || 90));
  return {
    story_id: String(qa.story_id || storyId),
    evaluation_cycle: Number(qa.evaluation_cycle || 1),
    evaluated_file: String(qa.evaluated_file || evaluatedFile),
    final_scores: {
      opening_hook: clampScore(Number(scores.opening_hook || 18)),
      conflict_strength: clampScore(Number(scores.conflict_strength || 14)),
      pacing: clampScore(Number(scores.pacing || 14)),
      twist: clampScore(Number(scores.twist || 9)),
      emotional_payoff: clampScore(Number(scores.emotional_payoff || 14)),
      ending: clampScore(Number(scores.ending || 14)),
      character_consistency: clampScore(Number(scores.character_consistency || 7)),
      total,
    },
    status: total >= 90 ? "PASS" : "REWRITE",
    rewrite_targets: Array.isArray(qa.rewrite_targets) ? qa.rewrite_targets : [],
  };
}

function buildDeepSeekFinalText(pack, idea, candidate) {
  const generated = normalizeMarkdown(pack?.final_md || pack?.final || "", idea.title, candidate).trim();
  if (generated && !generated.includes("The conflict rises.")) return `${generated}\n`;
  const opening = String(pack?.opening_line || idea.one_sentence_hook || candidate.core_conflict || "所有人都以为她已经退无可退。");
  const twist = String(pack?.twist_line || candidate.twist_direction || "直到最后一份证据被公开，真正掌握规则的人才浮出水面。");
  const opponent = String(candidate.obstacle_or_antagonist || "对手");
  const protagonist = String(candidate.protagonist || "主角");
  const skill = String(candidate.writing_skill?.guidance || "前三百字必须给出压迫、反击和反转承诺。");
  return [
    `# ${idea.title}`,
    "",
    opening,
    "",
    `${protagonist}没有解释，也没有求饶。${opponent}把所有退路都堵死时，现场的目光已经变成一场公开审判。`,
    "",
    `她只做了一件事：把那份被藏起来的记录投到大屏上。上一秒还在嘲笑她的人，下一秒全部安静下来。`,
    "",
    `${twist} ${skill}`,
    "",
    "这一次，她不是被推上台的人，而是亲手改写结局的人。",
    "",
  ].join("\n");
}

function normalizeMarkdown(value, title, candidate) {
  const text = stripCodeFence(String(value || "")).trim();
  if (text) return `${text}\n`;
  return `# ${title}\n\n${candidate.core_conflict || "The conflict rises."}\n\n${candidate.twist_direction || "The ending turns."}\n`;
}

function clampScore(value) {
  if (!Number.isFinite(value)) return 0;
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function runInProcessMockWorkflow(root, date, progressFile, storyIndex, options = {}) {
  const { plan, candidate } = await storyStrategy.selectCandidateForStory(root, date, storyIndex, options);
  const baseSlug = candidate.slug || `dashboard-story-${String(storyIndex).padStart(3, "0")}`;
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
    title: candidate.working_title,
    genre: candidate.genre,
    theme: candidate.theme,
    type: candidate.type,
    one_sentence_hook: `${candidate.commercial_angle}：${candidate.core_conflict}`,
    core_conflict: candidate.core_conflict,
    protagonist: candidate.protagonist,
    obstacle_or_antagonist: candidate.obstacle_or_antagonist,
    twist_direction: candidate.twist_direction,
    viral_score: candidate.scores?.total ?? 80,
    hotness_basis: candidate.hotness_basis,
    writing_skill: candidate.writing_skill,
    slug,
  };
  const outline = {
    target_total_words: 300,
    chapter_count: 2,
    chapters: [
      {
        chapter_number: 1,
        target_words: 150,
        core_event: `主角遭遇核心压力：${candidate.core_conflict}`,
        conflict: candidate.obstacle_or_antagonist,
        ending_hook: "主角发现反击所需的关键证据或规则。",
      },
      {
        chapter_number: 2,
        target_words: 150,
        core_event: `反转兑现：${candidate.twist_direction}`,
        conflict: "对手试图最后一次夺回叙事权。",
        ending_hook: "主角公开确认新的身份或资源归属。",
      },
    ],
    final_ending: candidate.monetization_hook,
  };

  await runLocalStage(progressFile, storyId, "idea", 1, async () => {
    await writeJson(path.join(storyDir, "idea.json"), idea);
  });
  await runLocalStage(progressFile, storyId, "outline", 1, async () => {
    await writeJson(path.join(storyDir, "outline.json"), outline);
  });
  await runLocalStage(progressFile, storyId, "writer", 1, async () => {
    await writeFile(
      path.join(storyDir, "draft_v1.md"),
      `# ${idea.title}\n\n${idea.protagonist}在公开场合被逼到退无可退。${idea.core_conflict}\n\n${idea.obstacle_or_antagonist}以为所有人都会站在自己这边，却忽略了主角早已掌握最后一枚证据。\n`,
      "utf8",
    );
  });
  await runLocalStage(progressFile, storyId, "qa", 1, async () => {
    await writeJson(path.join(storyDir, "qa_v1.json"), qaPayload(storyId, 1, "draft_v1.md", 82, "REWRITE"));
  }, "rewrite", 82);
  await runLocalStage(progressFile, storyId, "rewrite", 1, async () => {
    await writeFile(
      path.join(storyDir, "draft_v2.md"),
      `# ${idea.title}\n\n镜头、群聊或会议记录同时亮起时，${idea.protagonist}没有解释，而是先抛出一份无法抵赖的证据。\n\n${idea.twist_direction} 围观者终于意识到，真正掌握规则的人从来不是对手。${candidate.writing_skill?.guidance || ""}\n`,
      "utf8",
    );
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
    pass_threshold: 90,
    files: {
      idea: `${storyDirRelative}/idea.json`,
      outline: `${storyDirRelative}/outline.json`,
      draft_v1: `${storyDirRelative}/draft_v1.md`,
      qa_v1: `${storyDirRelative}/qa_v1.json`,
      draft_v2: `${storyDirRelative}/draft_v2.md`,
      qa_v2: `${storyDirRelative}/qa_v2.json`,
      final: `${storyDirRelative}/final.md`,
    },
    planning: {
      today: "planning/today.json",
      candidate_id: candidate.candidate_id,
      rank: candidate.rank,
      hotness_basis: candidate.hotness_basis,
      writing_skill: candidate.writing_skill,
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
  await sleep(isEphemeralRuntime() ? 50 : 250);
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
  const canonicalDir = path.join(storiesRoot(root), summary.story_id);

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
  const existingStoryMeta = await readJson(path.join(canonicalDir, "story.meta.json"), true);
  const readCount = Number(existingStoryMeta?.read_count ?? existingMeta?.metrics?.read_count ?? existingMeta?.read_count ?? 0);
  const dropOffUsers = Number(existingStoryMeta?.drop_off_users ?? existingMeta?.metrics?.drop_off_users ?? existingMeta?.drop_off_users ?? 0);
  const meta = {
    story_id: summary.story_id,
    created_at: createdAt,
    updated_at: new Date().toISOString(),
    status,
    title,
    summary: summaryText,
    genre: manifest.genre || idea.genre || "",
    theme: idea.theme || manifest.planning?.theme || "",
    type: idea.type || "",
    hotness_basis: idea.hotness_basis || manifest.planning?.hotness_basis || "",
    writing_skill: idea.writing_skill || manifest.planning?.writing_skill || null,
    metrics: {
      read_count: readCount,
      drop_off_users: dropOffUsers,
    },
    source_story_dir: summary.story_dir,
  };
  await writeFile(path.join(canonicalDir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  const storyMeta = buildStoryMeta(summary.story_id, {
    ...meta,
    read_count: readCount,
    drop_off_users: dropOffUsers,
    qa_score: Number(manifest.final_score ?? manifest.qa_score ?? summary.final_score ?? 0) || null,
    rewrite_count: Number(manifest.rewrite_round ?? 0),
  });
  await writeFile(path.join(canonicalDir, "story.meta.json"), `${JSON.stringify(storyMeta, null, 2)}\n`, "utf8");

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
        read_count: readCount,
        drop_off_users: dropOffUsers,
        final_text: finalText,
        meta,
        files: fileList(root, `stories/${summary.story_id}`),
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

async function getDashboardState(root, runId, options = {}) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  await initDashboardStore(runtimeRoot);
  let libraryPayload = await getLibraryStories(runtimeRoot, { page: 1, pageSize: LIBRARY_PAGE_SIZE });
  let run = runId ? await runPythonStore(runtimeRoot, ["run", "--run-id", runId]) : null;
  if (run && !options.skipProcessing && !isEphemeralRuntime()) {
    await processEphemeralRunIfNeeded(runtimeRoot, run);
    run = await runPythonStore(runtimeRoot, ["run", "--run-id", runId]);
    libraryPayload = await getLibraryStories(runtimeRoot, { page: 1, pageSize: LIBRARY_PAGE_SIZE });
  }
  const planning = await storyStrategy.readTodayStrategy(runtimeRoot);
  const progressStories = runId ? await readRunProgress(runtimeRoot, runId, run?.requested_count || 0) : [];
  const completedById = new Map((run?.stories || []).map((story) => [story.id, story]));
  const mergedRunStories = progressStories.map((progressStory) => {
    const completed = progressStory.id ? completedById.get(progressStory.id) : null;
    return mergeStoryState(progressStory, completed);
  });

  return {
    runtime: getRuntimeStatus(),
    planning,
    active_run: run
      ? {
          ...run,
          stories: mergedRunStories.length ? mergedRunStories : run.stories || [],
      }
      : null,
    stories: libraryPayload.items || [],
    library: libraryPayload,
  };
}

function buildStoryMeta(storyId, source = {}) {
  const metrics = source.metrics && typeof source.metrics === "object" ? source.metrics : {};
  const now = new Date().toISOString();
  return {
    type: "story",
    story_id: storyId,
    title: String(source.title || storyId),
    summary: String(source.summary || ""),
    tags: Array.isArray(source.tags) ? source.tags : [],
    genre: String(source.genre || source.type || ""),
    status: source.status || "done",
    created_at: source.created_at || now,
    updated_at: source.updated_at || now,
    read_count: Number(source.read_count ?? metrics.read_count ?? 0),
    drop_off_users: Number(source.drop_off_users ?? metrics.drop_off_users ?? 0),
    qa_score: source.qa_score ?? source.final_score ?? null,
    rewrite_count: Number(source.rewrite_count ?? source.rewrite_round ?? 0),
    source: source.source || "story-forge",
  };
}

async function getLibraryStories(root, options = {}) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  const page = clampNumber(options.page, 1, 100000, 1);
  const pageSize = clampNumber(options.pageSize, 1, 50, LIBRARY_PAGE_SIZE);
  const allStories = await scanLibraryStories(runtimeRoot);
  const total = allStories.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageSize,
    total,
    totalPages,
    items: allStories.slice(offset, offset + pageSize),
  };
}

async function scanLibraryStories(root) {
  const rootDir = storiesRoot(root);
  if (!existsSync(rootDir)) return [];
  const entries = await readdir(rootDir, { withFileTypes: true });
  const items = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const storyDir = path.join(rootDir, entry.name);
    const story = await readLibraryStoryDir(root, storyDir, entry.name, { allowBackfill: true });
    if (story) items.push(story);
  }
  return items.sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || String(b.id).localeCompare(String(a.id)));
}

async function readLibraryStoryDir(root, storyDir, storyId, options = {}) {
  const finalPath = path.join(storyDir, "final.md");
  if (!existsSync(finalPath)) return null;
  const storyMetaPath = path.join(storyDir, "story.meta.json");
  let storyMeta = await readJson(storyMetaPath, true);
  if (!storyMeta && options.allowBackfill) {
    storyMeta = await backfillStoryMeta(root, storyDir, storyId);
  }
  if (!storyMeta || storyMeta.type !== "story" || storyMeta.status !== "done") return null;
  if (storyMeta.story_id && storyMeta.story_id !== storyId) return null;
  const summaryText = storyMeta.summary || (await readText(path.join(storyDir, "summary.txt"))).trim();
  if (!summaryText) return null;
  return {
    id: storyId,
    story_id: storyId,
    title: storyMeta.title || storyId,
    summary: summaryText,
    tags: Array.isArray(storyMeta.tags) ? storyMeta.tags : [],
    genre: storyMeta.genre || "",
    status: storyMeta.status,
    created_at: storyMeta.created_at || "",
    updated_at: storyMeta.updated_at || storyMeta.created_at || "",
    read_count: Number(storyMeta.read_count || 0),
    drop_off_users: Number(storyMeta.drop_off_users || 0),
    qa_score: storyMeta.qa_score ?? null,
    rewrite_count: Number(storyMeta.rewrite_count || 0),
    source: storyMeta.source || "story-forge",
  };
}

async function backfillStoryMeta(root, storyDir, storyId) {
  const legacyMeta = await readJson(path.join(storyDir, "meta.json"), true);
  if (!legacyMeta) return null;
  const status = legacyMeta.status === "passed" ? "done" : legacyMeta.status;
  if (status !== "done") return null;
  const summaryText = legacyMeta.summary || (await readText(path.join(storyDir, "summary.txt"))).trim();
  if (!summaryText) return null;
  const storyMeta = buildStoryMeta(storyId, {
    ...legacyMeta,
    status: "done",
    summary: summaryText,
    read_count: legacyMeta.read_count ?? legacyMeta.metrics?.read_count ?? 0,
    drop_off_users: legacyMeta.drop_off_users ?? legacyMeta.metrics?.drop_off_users ?? 0,
    qa_score: legacyMeta.qa_score ?? legacyMeta.final_score ?? null,
    rewrite_count: legacyMeta.rewrite_count ?? legacyMeta.rewrite_round ?? 0,
  });
  await writeFile(path.join(storyDir, "story.meta.json"), `${JSON.stringify(storyMeta, null, 2)}\n`, "utf8");
  return storyMeta;
}

async function updateLibraryStoryMetrics(root, storyId, readCount, dropOffUsers) {
  const read_count = validateMetric(readCount, "read_count");
  const drop_off_users = validateMetric(dropOffUsers, "drop_off_users");
  const runtimeRoot = await prepareRuntimeRoot(root);
  const storyDir = path.join(storiesRoot(runtimeRoot), storyId);
  if (!existsSync(storyDir)) throw new Error("story folder not found.");
  const story = await readLibraryStoryDir(runtimeRoot, storyDir, storyId, { allowBackfill: true });
  if (!story) throw new Error("story.meta.json with final.md is required.");
  const storyMetaPath = path.join(storyDir, "story.meta.json");
  const storyMeta = await readJson(storyMetaPath);
  storyMeta.read_count = read_count;
  storyMeta.drop_off_users = drop_off_users;
  storyMeta.updated_at = new Date().toISOString();
  await writeFile(storyMetaPath, `${JSON.stringify(storyMeta, null, 2)}\n`, "utf8");

  const legacyMetaPath = path.join(storyDir, "meta.json");
  const legacyMeta = await readJson(legacyMetaPath, true);
  if (legacyMeta) {
    legacyMeta.metrics = { read_count, drop_off_users };
    legacyMeta.updated_at = storyMeta.updated_at;
    await writeFile(legacyMetaPath, `${JSON.stringify(legacyMeta, null, 2)}\n`, "utf8");
  }

  await initDashboardStore(runtimeRoot);
  await runPythonStore(runtimeRoot, [
    "update-metrics",
    "--story-id",
    storyId,
    "--read-count",
    String(read_count),
    "--drop-off-users",
    String(drop_off_users),
  ]);
  await storyStrategy.updateFeedbackLearning(runtimeRoot, storyId, { read_count, drop_off_users });
  return getLibraryStoryDetail(runtimeRoot, storyId);
}

async function getLibraryStoryDetail(root, storyId) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  const storyDir = path.join(storiesRoot(runtimeRoot), storyId);
  const story = await readLibraryStoryDir(runtimeRoot, storyDir, storyId, { allowBackfill: true });
  if (!story) throw new Error("story not found in local stories folder.");
  const finalText = await readText(path.join(storyDir, "final.md"));
  const pipelineLogs = await readStoryLogs(runtimeRoot, storyId);
  const relativeStoryDir = path.relative(runtimeRoot, storyDir).replaceAll("\\", "/");
  return {
    ...story,
    final_text: finalText,
    files: fileList(runtimeRoot, relativeStoryDir),
    meta: await readJson(path.join(storyDir, "story.meta.json"), true),
    pipeline_logs: pipelineLogs,
  };
}

async function readStoryLogs(root, storyId) {
  try {
    await initDashboardStore(root);
    const story = await runPythonStore(root, ["story", "--story-id", storyId]);
    return story.pipeline_logs || [];
  } catch {
    return [];
  }
}

async function cancelTask(root, taskId) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  await initDashboardStore(runtimeRoot);
  const parsed = parseTaskId(taskId);
  if (!parsed.runId || !parsed.storyIndex) {
    throw new Error("Invalid task_id.");
  }

  const progressFile = progressPath(runtimeRoot, parsed.runId, parsed.storyIndex);
  const progressStory = storyFromEvents(parsed.storyIndex, await readProgressEvents(progressFile));
  const storyId = progressStory.id || "";
  await runPythonStore(runtimeRoot, [
    "cancel-task",
    "--task-id",
    taskId,
    "--run-id",
    parsed.runId,
    "--story-index",
    String(parsed.storyIndex),
    "--story-id",
    storyId,
  ]);

  const child = ACTIVE_TASK_CHILDREN.get(taskId);
  if (child) {
    try {
      child.kill();
    } catch {
      // Best-effort cancellation. The persisted cancelled flag still hides and stops future processing.
    }
  }

  await appendCancelledProgress(progressFile, parsed.storyIndex, storyId);
  return {
    ok: true,
    task_id: taskId,
    status: "cancelled",
  };
}

async function clearTaskQueue(root) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  const queue = await getTaskQueue(runtimeRoot, { limit: 40 });
  const cleared = [];
  for (const task of queue.tasks || []) {
    const result = await cancelTask(runtimeRoot, task.task_id);
    cleared.push(result.task_id);
  }
  return {
    ok: true,
    cleared_count: cleared.length,
    cleared_task_ids: cleared,
  };
}

async function getTaskQueue(root, options = {}) {
  const runtimeRoot = await prepareRuntimeRoot(root);
  await initDashboardStore(runtimeRoot);
  const limit = clampNumber(options.limit, 1, 40, 5);
  const cancelledTasks = (await runPythonStore(runtimeRoot, ["list-cancelled-tasks"])).tasks || [];
  const cancelledIds = new Set(cancelledTasks.map((task) => task.task_id));
  const runs = (await runPythonStore(runtimeRoot, ["list-runs"])).runs || [];
  const tasks = [];
  for (const run of runs) {
    const options = await readRunOptions(runtimeRoot, run.id);
    const progressStories = await readRunProgress(runtimeRoot, run.id, Number(run.requested_count || 1));
    const persistedRun = await runPythonStore(runtimeRoot, ["run", "--run-id", run.id]);
    const completedById = new Map((persistedRun?.stories || []).map((story) => [story.id, story]));
    for (const progressStory of progressStories) {
      const completed = progressStory.id ? completedById.get(progressStory.id) : null;
      const merged = mergeStoryState(progressStory, completed);
      const taskId = `${run.id}:${merged.story_index}`;
      if (cancelledIds.has(taskId) || merged.status === "cancelled") continue;
      if (!merged.id && run.status === "done") continue;
      tasks.push({
        task_id: taskId,
        run_id: run.id,
        topic_id: options.candidateId || options.candidate_id || "",
        story_id: merged.id || "",
        title: options.topicTitle || options.topic_title || merged.title || merged.id || `任务 #${merged.story_index}`,
        current_stage: merged.current_stage || "Pending",
        current_status: merged.status || run.status || "pending",
        pipeline_steps: merged.pipeline_steps || [],
        files: merged.id ? fileList(runtimeRoot, `stories/${merged.id}`) : [],
        story_index: merged.story_index,
        created_at: merged.created_at || run.created_at,
        updated_at: run.updated_at,
      });
    }
  }
  return {
    tasks: tasks
      .sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")) || String(b.updated_at || "").localeCompare(String(a.updated_at || "")))
      .slice(0, limit),
  };
}

async function updateStoryMetrics(root, storyId, readCount, dropOffUsers) {
  return updateLibraryStoryMetrics(root, storyId, readCount, dropOffUsers);
}

async function getStoryDetail(root, storyId) {
  return getLibraryStoryDetail(root, storyId);
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

async function copyDirectoryMissing(source, target) {
  if (!existsSync(source)) return;
  await mkdir(target, { recursive: true });
  const entries = await readdir(source, { withFileTypes: true });
  for (const entry of entries) {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      await copyDirectoryMissing(sourcePath, targetPath);
    } else if (!existsSync(targetPath)) {
      await mkdir(path.dirname(targetPath), { recursive: true });
      await copyFile(sourcePath, targetPath);
    }
  }
}

async function findNamedFiles(dir, fileName, maxDepth) {
  if (maxDepth < 0 || !existsSync(dir)) return [];
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      files.push(...await findNamedFiles(fullPath, fileName, maxDepth - 1));
    } else if (entry.name === fileName) {
      files.push(fullPath);
    }
  }
  return files;
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
  cancelTask,
  clearTaskQueue,
  getDashboardState,
  getStoryDetail,
  getLibraryStories,
  getLibraryStoryDetail,
  getTaskQueue,
  getRuntimeStatus,
  getTodayTopics,
  initDashboardStore,
  processDashboardRun,
  processDashboardRunSafely,
  refreshTodayTopics,
  startDashboardRun,
  updateLibraryStoryMetrics,
  updateStoryMetrics,
  validateCount,
};

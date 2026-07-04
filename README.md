# Story Forge

Story Forge 是一个面向短故事生产的本地内容运营工作台。它把“今天应该写什么”的内容策划层，与 Idea → Outline → Writer → QA → Rewrite → Final 的故事生产流程连接起来，让用户通过一个本地 Dashboard 完成选题、生成、任务管理、作品库查看和数据回填。

当前项目已经进入基本可用阶段：

- 本地 Web Dashboard 可运行。
- 默认使用 mock provider，不需要 API key 也能体验完整流程。
- 可选接入 OpenAI 或 DeepSeek。
- 推荐主题、任务队列、作品库、作品详情和指标回填已经可用。
- 最新完整代码以 `main` 分支为准。

## 快速开始

### 1. 下载项目

```powershell
git clone https://github.com/opt1997/story-forge.git
cd story-forge
```

如果已经下载过项目：

```powershell
git checkout main
git pull origin main
```

### 2. 安装依赖

项目当前使用 Next.js、React 和 npm lockfile。推荐使用 npm：

```powershell
npm install
```

### 3. 本地启动

```powershell
npm run dev
```

启动后打开：

```text
http://localhost:3000
```

默认情况下系统使用 `mock` provider，不会调用真实 AI API。你可以直接点击页面右上角的“开始创作”体验完整本地流程。

### 4. 构建验证

```powershell
npm run build
```

当前构建可能出现 Turbopack NFT tracing warning，原因是 Dashboard runtime 会访问本地文件系统；只要最终显示 compiled successfully，即可视为构建通过。

## 本地运行要求

建议环境：

- Git
- Node.js 20+
- npm

说明：

- Dashboard 本地开发使用 `npm run dev`。
- 基础构建使用 `npm run build`。
- 命令行执行真实 Workflow 时，部分 TypeScript 执行模块可能需要 Node 24+；如遇到 Node 版本提示，可安装 Node 24+，或通过 `STORY_FORGE_NODE` 指向可用 Node 可执行文件。

## 可选：启用真实模型

默认不需要配置 API key。只有显式设置 provider 和 key 后，系统才会调用真实模型。

### DeepSeek

PowerShell 示例：

```powershell
$env:STORY_FORGE_LLM_PROVIDER="deepseek"
$env:DEEPSEEK_API_KEY="sk-..."
$env:STORY_FORGE_DEEPSEEK_MODEL="deepseek-v4-flash"
npm run dev
```

可选按 agent 设置模型：

```powershell
$env:STORY_FORGE_DEEPSEEK_IDEA_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_OUTLINE_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_WRITER_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_QA_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_REWRITE_MODEL="deepseek-v4-flash"
```

### OpenAI

PowerShell 示例：

```powershell
$env:STORY_FORGE_LLM_PROVIDER="openai"
$env:OPENAI_API_KEY="sk-..."
$env:STORY_FORGE_OPENAI_MODEL="gpt-5.5"
npm run dev
```

可选按 agent 设置模型：

```powershell
$env:STORY_FORGE_OPENAI_IDEA_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_OUTLINE_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_WRITER_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_QA_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_REWRITE_MODEL="gpt-5.5"
```

不要把真实 `OPENAI_API_KEY`、`DEEPSEEK_API_KEY` 或其他密钥写入仓库文件。`.env*` 已被 `.gitignore` 忽略。

## 当前 Dashboard 功能

当前页面包含四个已落地模块：

- 开始创作：打开创作弹窗，一次创建 1-5 个生成任务。
- 推荐主题：后端生成 30 个候选主题，前端展示 Top 5，支持刷新和“用此主题生成”。
- 任务队列：展示最新 5 条任务，支持单任务删除/取消和一键清空。
- 作品库：读取本地 `stories/` 文件夹，展示完成作品，支持分页、详情、指标保存和打开文件夹。

右侧栏会根据当前选择展示：

- 今日创作概览
- 作品详情
- 任务详情

后续规划但当前未作为独立页面落地的模块：

- 数据复盘
- 系统设置

## 核心流程

Story Forge 当前运行流程：

```text
用户打开 Dashboard
  -> 点击开始创作或用推荐主题生成
  -> Dashboard API 创建 run/task
  -> story_strategy 读取 stories / metrics / planning / knowledge
  -> 生成或更新 planning/today.json
  -> 生成候选主题并排序
  -> 选中 Top 主题进入故事生产
  -> Idea
  -> Outline
  -> Writer
  -> QA
  -> Rewrite when needed
  -> QA again
  -> Final
  -> 写入 stories/
  -> 作品库读取 story.meta.json + final.md
  -> 用户回填 read_count / drop_off_users
```

核心生产链路保持：

```text
Idea -> Outline -> Writer -> QA -> Rewrite -> QA -> Final
```

当前不新增 TopicPlannerAgent、DiversityAgent 或 RankingAgent。选题策划、过滤和排序属于 Story Manager / strategy 层职责，不拆成新的业务 agent。

## 作品库数据规则

作品库以本地 `stories/` 文件夹为主要数据源。数据库可以作为索引或缓存，但不能替代本地故事文件。

只有满足以下条件的作品文件夹会进入作品库：

- 包含 `story.meta.json`
- 包含 `final.md`
- `story.meta.json.type === "story"`
- `story.meta.json.status === "done"`

标准 `story.meta.json` 示例：

```json
{
  "type": "story",
  "story_id": "",
  "title": "",
  "summary": "",
  "tags": [],
  "genre": "",
  "status": "done",
  "created_at": "",
  "updated_at": "",
  "read_count": 0,
  "drop_off_users": 0,
  "qa_score": null,
  "rewrite_count": 0,
  "source": "story-forge"
}
```

作品库中的 `read_count` 和 `drop_off_users` 保存后会写回对应作品的 `story.meta.json`。

## 目录结构

主要目录：

```text
app/                         Next.js Dashboard 页面和 API
core/                        Workflow Engine、Agent Runtime、LLM Provider
scripts/                     Dashboard runtime、story strategy、本地执行脚本
agents/                      Agent 职责文档和学习 proposal
rules/                       写作、评分、格式、禁忌等规则
prompts/                     Prompt 模板与 proposal
planning/                    今日/周/月策略和主题规划
knowledge/                   趋势样例和反馈学习数据
stories/                     本地故事产物目录
metrics/                     SQLite/JSONL schema 与指标说明
templates/                   manifest 等模板
docs/                        当前交接文档、规格和测试清单
netlify/                     Netlify 相关实验/部署文件
```

关键文件：

```text
app/page.js
app/globals.css
scripts/dashboard_runtime.js
scripts/story_strategy.js
scripts/dashboard_store.py
core/workflow/workflow-engine.ts
core/runtime/agent-registry.ts
core/runtime/agent-runtime.ts
core/llm/provider.ts
docs/HANDOFF.md
docs/CURRENT_SPEC.md
docs/TEST_PLAN.md
docs/ACCEPTANCE_CHECKLIST.md
```

## API 概览

Dashboard 当前主要 API：

```text
GET  /api/dashboard
GET  /api/topics/today
POST /api/topics/refresh
POST /api/stories/start-today
POST /api/stories/start-from-topic
GET  /api/stories/tasks
POST /api/stories/tasks/[task_id]/cancel
POST /api/tasks/clear
GET  /api/library/stories
POST /api/library/stories/[story_id]/metrics
GET  /api/story
POST /api/story-metrics
POST /api/folders/open
```

`/api/folders/open` 只允许打开 `stories/` 内目录，避免前端传入任意本地路径。

## 命令行执行

除了 Dashboard，也可以直接运行 workflow：

```powershell
npm run exec:mock
npm run exec:openai
npm run exec:deepseek
```

真实 provider 需要先设置对应 API key。

## 基础验收

可按以下顺序检查：

1. `npm install`
2. `npm run dev`
3. 打开 `http://localhost:3000`
4. 首页展示 5 条推荐主题
5. 点击“刷新主题”
6. 点击“开始创作”
7. 任务队列出现新任务
8. 作品库可以读取本地完成作品
9. 修改并保存 `read_count`
10. 修改并保存 `drop_off_users`
11. `npm run build`

更完整的测试清单见：

- `docs/TEST_PLAN.md`
- `docs/ACCEPTANCE_CHECKLIST.md`

## 文档入口

新 Codex 窗口或新开发者建议先读：

1. `docs/HANDOFF.md`
2. `docs/CURRENT_SPEC.md`
3. `docs/TEST_PLAN.md`
4. `docs/ACCEPTANCE_CHECKLIST.md`
5. `AGENTS.md`
6. `PROJECT_STATE.md`

如果历史文档与当前代码存在差异，以当前 Git 代码和 `docs/` 当前文档为准。

## 项目限制

- 不接入番茄小说后台。
- 不自动发布内容。
- 不绕过任何网站风控。
- 不随意新增 Agent。
- 不重构核心 Workflow。
- 不把 UI 做成纯 mock。
- 不把作品库主数据源改成数据库。
- 不自动覆盖 prompt 或 rules。
- 不提交真实 API key、token、cookie、私钥或生产凭据。

## 当前状态

Story Forge 当前已经具备本地基本可用的内容生产闭环。推荐后续工作优先围绕稳定性、测试、作品库数据规范和数据复盘展开，而不是继续扩大 UI 复杂度或新增 agent 架构。

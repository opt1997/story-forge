# Story Forge 项目状态

更新时间：2026-07-04

这个文件是 Story Forge 的“大脑记忆”。新窗口或新的 Codex 会话接手前，先读这里，再读 `README.md`、`AGENTS.md` 和核心代码。

## 0. 2026-07-04 交接快照

本节记录最近一次主对话已经完成的任务，供上下文压缩或新对话接手时快速恢复。当前工作区存在大量未提交改动，后续 agent 必须先读 `git status --short` 和相关 diff，不能随意回滚。

### 已完成任务

- 已完成 Story Forge Dashboard 前端重设计第一阶段：
  - 主页面仍在 `app/page.js`。
  - 主样式仍在 `app/globals.css`。
  - 保留 Next.js API 合约：`/api/dashboard`、`/api/start-today`、`/api/story`、`/api/story-metrics`。
  - 新增/复用 Dashboard API：`/api/topics/*`、`/api/stories/*`、`/api/library/stories*`、`/api/tasks/clear`、`/api/folders/open`。
  - 保留“开始创作”弹窗、运行中轮询、故事详情、read_count/drop_off_users 保存。
- 已完成 Dashboard v0.4 调整：
  - 删除主区“今日创作策略”展示。
  - 当前生成监测改为“当前任务”。
  - 当前任务新增“一键清空”。
  - 顶部右侧移除“刷新”按钮，仅保留“开始创作”。
  - 作品库改为读取本地完成作品库，而不是直接混用 active_run。
- 已完成 Dashboard v0.5 调整：
  - 主区只展示列表摘要。
  - 作品库主区只展示：标题、创建时间、短摘要、标签、read_count、drop_off_users、保存按钮。
  - 作品库主区不展示状态、不展示 QA 分数、不展示正文预览、不展示 pipeline logs。
  - 只有已完成且有 `story.meta.json` + `final.md` 的文章进入作品库。
  - 点击作品后，右侧栏切换为“作品详情”，显示标题、时间、摘要、标签、QA 分数、返工次数、日志数、阅读量、触底人数、文章状态、`final.md` 前约 900 字预览。
  - 当前任务主区只展示：标题/task_id、创建时间、用户化状态、删除按钮。
  - 当前任务主区不展示完整 pipeline 流，不展示 Writer/QA/Rewrite 轮次。
  - 点击任务后，右侧栏切换为“任务详情”，显示 task_id、story_id、当前阶段、当前状态、创建/更新时间、完整 pipeline、writer_round、qa_round、rewrite_round、pipeline logs、文件状态。
  - 未选中任何作品/任务时，右侧栏默认显示“今日创作概览”。
  - 作品和任务互斥选中，选中态高亮。
  - 作品库头部新增“打开文件夹”按钮，可打开本地 `stories/`。
  - 作品库每篇作品的保存按钮后新增“打开”按钮，可打开对应作品目录。
- 已完成 iOS 风格视觉换皮：
  - 保持三层布局和功能不变。
  - 将偏复古的墨黑/暖纸/墨绿视觉替换为更接近 iOS 的浅灰背景、半透明白卡片、细描边、轻阴影、系统蓝主按钮。
  - 主要改动文件：`app/globals.css`。
  - 侧栏从黑底改为浅色磨砂导航。
  - 顶部命令栏改为半透明白 + blur。
  - 卡片、弹窗、右侧栏统一为清爽白/浅灰风格。
  - 状态色仍保留：蓝色信息、绿色完成、琥珀运行、珊瑚失败。
- 已完成中文乱码修复：
  - `app/page.js` 当前展示文案已恢复为正常中文。
- 已完成 DeepSeek 本地配置指导：
  - 用户提供过 DeepSeek API 凭据；不要把真实 key 写入仓库。
  - 结论：DeepSeek 应使用 `DEEPSEEK_API_KEY`，填用户称为 `apisecret` 的 `sk-...` 值，不填短的 `apikey`。
  - 模型可通过环境变量切换，例如 `STORY_FORGE_DEEPSEEK_MODEL`。
- 已完成本地/Netlify 部署判断：
  - Netlify 可用于轻量测试，但文章文件生成和持久化更适合本地运行。
  - 用户当前倾向：在这台电脑操作时使用本地部署/本地运行，避免把大文章长期放 Netlify。

### 验证记录

- `npm run build` 已多次通过。
  - 在沙盒内会因 Windows npm cache 权限报 `EPERM mkdir C:\Users\Administrator\AppData\Local\npm-cache\_cacache\tmp`。
  - 需要用提升权限重跑 `npm run build`。
  - 构建通过时仍有 Turbopack NFT tracing warning，来自 `scripts/dashboard_runtime.js` 动态文件系统访问，当前不阻塞。
- 浏览器验证已做：
  - 桌面 1440px：中文正常、无水平溢出、主区列表不显示正文/QA/pipeline 详情。
  - 移动端 390px：中文正常、无水平溢出、布局不重叠。
  - “开始创作”弹窗可打开/关闭。
  - 点击作品可切右栏“作品详情”。
  - 点击任务可切右栏“任务详情”。
  - 当前任务为空或被清空时，右栏默认概览、主区显示空状态。

### 当前存储规则

- 默认故事根目录：
  - `D:\codex-workspace\story-forge\stories\`
  - 若设置 `STORIES_ROOT`，则使用该目录。
- 当前 Dashboard 作品库读取的是扁平完成作品目录：
  - `stories/{YYYYMMDD}-{slug}/`
  - 示例：`stories/20260703-topic-0/`、`stories/20260703-topic-0-2/`
  - 重名时自动追加 `-2`、`-3` 等后缀。
- 作品库只纳入：
  - 有 `story.meta.json`
  - 有 `final.md`
  - `story.meta.json.status === "done"`
- 单篇完成作品目录通常包含：
  - `idea.json`
  - `outline.json`
  - `draft.md`
  - `final.md`
  - `story_manifest.json`
  - `execution_trace.json`
  - `pipeline_state.json`
  - `agent_io.jsonl`
  - `meta.json`
  - `story.meta.json`
  - `summary.txt`
- 旧/核心 Workflow 仍可能生成嵌套目录：
  - `stories/{YYYYMMDD}/{slug}/`
  - Dashboard runtime 会把通过的故事整理/复制为扁平作品库目录。

### 关键实现位置

- 页面与交互：`app/page.js`
- 全局视觉样式：`app/globals.css`
- Dashboard runtime、故事生成、作品库扫描、任务队列：`scripts/dashboard_runtime.js`
- 本地 SQLite dashboard store：`scripts/dashboard_store.py`
- 作品库 API：
  - `app/api/library/stories/route.js`
  - `app/api/library/stories/[story_id]/metrics/route.js`
- 本地文件夹 API：
  - `app/api/folders/open/route.js`
- 任务 API：
  - `app/api/stories/tasks/route.js`
  - `app/api/stories/tasks/[task_id]/cancel/route.js`
  - `app/api/tasks/clear/route.js`
- 主题 API：
  - `app/api/topics/today/route.js`
  - `app/api/topics/refresh/route.js`

### 当前注意事项

- 工作区仍是 dirty 状态，很多文件早于最近一轮已经修改；不要假设全是本轮改动。
- 不要提交、重置或回滚，除非用户明确要求。
- 不要把真实 DeepSeek key/API secret 写进 tracked 文件。
- 不要新增 Agent，不要改 Story Manager 核心规则，不要改 workflow engine 顺序，除非用户明确提出。
- 如需继续验证 UI，优先启动/访问 `http://127.0.0.1:3000/`。
- 如果本地页面空状态显示 0 篇作品，先检查 `STORIES_ROOT`、`stories/` 目录和 `story.meta.json` 是否存在，不要直接判断功能坏了。

## 1. 当前架构

Story Forge 已经从 V1/V1.5 的文档骨架，升级成一个本地可运行的 AI 内容生产系统雏形。

当前分层：

```text
User
  -> Web Dashboard / Start Today API
  -> Story Manager 概念入口与 planning 文件
  -> Dashboard Runtime
  -> Workflow Engine
  -> Agent Runtime
  -> Agent Registry
  -> LLM Provider
  -> Mock / OpenAI / DeepSeek / Claude placeholder
  -> File System + SQLite + JSONL logs
```

核心边界：

- Story Manager 仍然是概念上的唯一入口，负责规划、策略和选题决策。
- 真正可执行的流程编排在 `core/workflow/workflow-engine.ts`。
- Agent 执行统一在 `core/runtime/agent-runtime.ts` 和 `core/runtime/agent-registry.ts`。
- 模型调用统一在 `core/llm/`。
- Dashboard 通过 `scripts/dashboard_runtime.js` 启动工作流、读取状态、返回给前端。
- 当前不接发布平台，不自动发布，不做任何网站风控绕过。

当前用户路径：

```text
打开 Dashboard
  -> 点击“开始今天的创作”
  -> 选择生成数量 1-5
  -> POST /api/start-today
  -> dashboard_runtime 创建 run
  -> WorkflowEngine 执行 story pipeline
  -> 前端轮询 /api/dashboard
  -> 文件系统 + SQLite + JSONL 持久化结果
```

## 2. 已完成模块

架构与文档：

- `AGENTS.md` 已定义 Story Manager 为用户入口，并记录 agent 边界。
- `agents/*.agent.md` 已覆盖 Story Manager、Idea、Outline、Writer、QA、Rewrite、Recorder、Evolver。
- `planning/` 已存在：`today.json`、`weekly.json`、`monthly.json`、`strategy.md`。
- `rules/` 已存在：format、pacing、scoring、style、taboo。
- `prompts/style/v1.md` 和 `prompts/scoring/v1.md` 已存在。
- `templates/story_manifest.template.json` 已存在。
- `README.md` 已记录 V1.5、M3.1 Dashboard 和 Real AI Execution Architecture。

执行架构：

- `core/llm/types.ts` 定义统一 LLM Provider 接口。
- `core/llm/provider.ts` 负责选择 `mock`、`openai`、`deepseek`、`claude`。
- `core/llm/openai.ts` 已实现 OpenAI Responses API 调用。
- `core/llm/deepseek.ts` 已实现 DeepSeek Chat API 调用。
- `core/llm/claude.ts` 是占位实现，当前不启用真实 Claude 调用。
- `core/runtime/execution-context.ts` 定义 `ExecutionContext`、`ExecutionConfig` 和 agent result 类型。
- `core/runtime/agent-runtime.ts` 负责统一运行 agent。
- `core/runtime/agent-registry.ts` 注册 mock agent 和真实 LLM agent。
- `core/workflow/workflow-engine.ts` 负责创建 story 目录、执行 pipeline、写入 manifest/state/trace/logs。
- `scripts/run_ai_execution.js` 是命令行执行入口。

Dashboard 与本地控制台：

- `app/page.js` 是 Next Dashboard 页面。
- `app/api/start-today/route.js` 启动一次创作 run。
- `app/api/dashboard/route.js` 返回当前 run、故事列表和 runtime provider 状态。
- `app/api/story/route.js` 返回故事详情。
- `app/api/story-metrics/route.js` 更新用户填写的 metrics。
- `scripts/m3_preview_server.js` 提供不依赖 Next dev server 的本地预览服务。
- `scripts/dashboard_runtime.js` 连接 Dashboard API、WorkflowEngine、SQLite 和文件系统。
- Dashboard 已显示当前运行模式：`Mock Mode`、`API Mode` 或 `Missing Key`。

存储：

- `scripts/dashboard_store.py` 管理本地 SQLite：`metrics/story_forge.sqlite`。
- `metrics/schema.sql` 定义长期 metrics 和 dashboard 相关表。
- 运行时 story 文件写入 `stories/`。
- `.gitignore` 已忽略运行产物，只保留 `stories/.gitkeep`。

版本状态：

- 当前主分支：`main`。
- 最近已知提交：`7be0db2 feat(dashboard): show active provider mode`。
- 近期能力包括：初始架构、Real AI Execution、OpenAI Provider、DeepSeek Provider、Dashboard runtime mode 提示。

## 3. Workflow 状态

已实现的可执行 pipeline：

```text
Idea
  -> Outline
  -> Writer
  -> QA
  -> Rewrite loop when score is below threshold
  -> Final when score passes
```

当前代码行为：

- 默认 provider 是 `mock`。
- 设置 `STORY_FORGE_LLM_PROVIDER=deepseek` 后使用 DeepSeek。
- 设置 `STORY_FORGE_LLM_PROVIDER=openai` 后使用 OpenAI。
- 设置 `STORY_FORGE_LLM_PROVIDER=claude` 会进入占位 provider，当前会报错，不是真实 Claude 集成。
- Workflow 会创建 `stories/{YYYYMMDD}/{slug}/`。
- Workflow 会写入：
  - `idea.json`
  - `outline.json`
  - `draft_v1.md`
  - `qa_v1.json`
  - rewrite draft 和后续 QA 文件
  - `final.md`
  - `story_manifest.json`
  - `pipeline_state.json`
  - `execution_trace.json`
  - `agent_io.jsonl`
- Workflow 会追加 `metrics/runs.jsonl`。
- Dashboard runtime 会把故事复制/整理成 dashboard 可展示结构，并写入 `summary.txt` 和 `meta.json`。
- Dashboard run 进度写在被忽略的 `metrics/dashboard_runs/`。

需要统一的 workflow 差异：

- 早期 V1.5 文档和模板写 `pass_threshold = 90`。
- 当前可执行 WorkflowEngine 使用 `qaThreshold: 85`，并写入 `pass_threshold: 85`。
- 早期文档写 Rewrite 最多 2 次、QA 最多 3 轮。
- 当前可执行 WorkflowEngine 使用 `maxRewriteRounds: 3`，可能产生 `draft_v4` / `qa_v4`，并放入 `extra_artifacts`。
- 后续必须决定：以当前执行代码为准更新文档，还是把执行代码改回旧规则。

## 4. Agent 状态

Story Manager：

- 文档中是唯一入口和内容规划者。
- 职责包括历史分析、今日策略、Topic Planning、Diversity Filtering、Story Ranking、Top N 选择。
- 当前代码尚未实现完整自动 Story Manager 策略生成。
- 当前 `planning/today.json` 仍是中性骨架，状态为 `pending_story_manager_generation`。

Idea Agent：

- 文档存在：`agents/idea.agent.md`。
- Runtime registry 已实现 mock 和真实 LLM 版本。
- 输出 `idea.json`。

Outline Agent：

- 文档存在：`agents/outline.agent.md`。
- Runtime registry 已实现 mock 和真实 LLM 版本。
- 输出 `outline.json`。

Writer Agent：

- 文档存在：`agents/writer.agent.md`。
- Runtime registry 已实现 mock 和真实 LLM 版本。
- 输出 `draft_v1.md`。

QA Agent：

- 文档存在：`agents/qa.agent.md`。
- Runtime registry 已实现 mock 和真实 LLM 版本。
- 输出 `qa_vN.json`。
- mock QA 首轮故意低分，用于验证 Rewrite loop。

Rewrite Agent：

- 文档存在：`agents/rewrite.agent.md`。
- Runtime registry 已实现 mock 和真实 LLM 版本。
- 输出返工后的 `draft_vN.md`。

Recorder：

- 文档存在：`agents/recorder.agent.md`。
- 概念上负责记录所有非 Recorder 阶段，并避免自循环。
- 当前可执行代码不是通过独立 Recorder runtime agent 记录，而是由 `WorkflowEngine.appendRunLog`、`metrics/runs.jsonl`、SQLite 和 dashboard progress log 承担。

Evolver：

- 文档存在：`agents/evolver.agent.md` 和 `scripts/evolve_prompts.md`。
- 规则是只输出 proposal，不能自动覆盖 prompt/rules。
- 当前 Dashboard workflow 没有自动触发 Evolver。

System Health：

- README 和需求中提到过 System Health。
- 当前 tracked source 中没有发现独立 System Health 模块或 report writer。
- 在有真实代码前，应视为未完成或文档级能力。

## 5. 数据结构

Planning：

- `planning/today.json`
  - history windows
  - planned genres
  - avoid genres
  - topic candidates
  - diversity filter
  - ranking
  - selected Top N
- `planning/weekly.json`
- `planning/monthly.json`
- `planning/strategy.md`

Story manifest：

- 模板：`templates/story_manifest.template.json`
- 关键字段：
  - `story_id`
  - `date`
  - `slug`
  - `title`
  - `genre`
  - `status`
  - `current_draft`
  - `current_qa`
  - `rewrite_round`
  - `qa_round`
  - `final_score`
  - `pass_threshold`
  - `files`
  - `prompt_versions`
  - `agent_versions`
  - `metrics`
  - `created_at`
  - `updated_at`

Workflow story 目录：

```text
stories/{YYYYMMDD}/{slug}/
  idea.json
  outline.json
  draft_v1.md
  qa_v1.json
  draft_v2.md
  qa_v2.json
  final.md
  story_manifest.json
  execution_trace.json
  pipeline_state.json
  agent_io.jsonl
```

Dashboard canonical story 目录：

```text
stories/{story_id}/
  idea.json
  outline.json
  draft.md
  final.md
  summary.txt
  meta.json
  story_manifest.json
  execution_trace.json
  pipeline_state.json
  agent_io.jsonl
```

SQLite tables：

- `prompt_versions`
- `stories`
- `story_metrics`
- `pipeline_logs`
- `dashboard_runs`
- `dashboard_run_stories`
- `runs`

Dashboard SQLite：

- 数据库文件：`metrics/story_forge.sqlite`。
- 管理脚本：`scripts/dashboard_store.py`。
- 保存 stories、story metrics、pipeline logs、dashboard runs 和 run/story 关系。

被忽略的运行数据：

- `stories/*`
- `metrics/runs.jsonl`
- `metrics/runs.sqlite`
- `metrics/story_forge.sqlite`
- `metrics/story_forge.sqlite-*`
- `metrics/dashboard_runs/`
- `.next/`
- `node_modules/`
- `.pnpm-store/`
- `.env*`

## 6. 当前进度

Milestone 状态：

- M1 Architecture：已完成。
- M1.5 Story Manager + Content Planning Layer：文档层已完成。
- M2 Workflow Engine：mock 模式已可运行。
- Real AI Execution Architecture：已实现 provider 抽象、runtime、registry、workflow engine、OpenAI provider、DeepSeek provider。
- DeepSeek 支持：已实现 `DEEPSEEK_API_KEY`、`DEEPSEEK_BASE_URL`、`STORY_FORGE_DEEPSEEK_MODEL` 和按 agent 配置 model。
- M3.1 Dashboard：已实现最小本地控制台，包括开始按钮、生成数量 1-5、轮询状态、故事时间轴、metrics 编辑、SQLite 持久化、runtime mode 提示。
- System Health：需求中存在，但 tracked source 中未见独立实现。

本地运行命令：

```powershell
npm run exec:mock
```

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
$env:STORY_FORGE_LLM_PROVIDER="deepseek"
$env:STORY_FORGE_DEEPSEEK_MODEL="deepseek-v4-flash"
npm run exec:deepseek
```

轻量 Dashboard 预览：

```powershell
$env:PORT="3101"
node scripts\m3_preview_server.js
```

Next Dashboard：

```powershell
pnpm install
pnpm dev
```

最近已知验证：

- `node --check scripts/dashboard_runtime.js` 通过。
- `node --check scripts/m3_preview_server.js` 通过。
- `/api/dashboard` 能返回 `provider`、`mode`、`model`、`key_env`、`has_api_key`、`api_enabled`。
- 模拟 DeepSeek 环境变量时，runtime status 会返回 `mode: api`。
- 当前 workspace 未安装本地 Next 依赖，`npm run build` 会因为找不到 `next` 命令失败。

观察到的未跟踪目录：

- `.workbuddy/`
- `prototype/`

除非用户明确要求并审查用途，否则不要提交这两个目录。

## 7. 未完成任务

最高优先级：

- 实现真正的 Story Manager planning execution：读取 `stories/`、`metrics/`、`planning/`，生成有意义的 `planning/today.json`，再把 Top N 交给 WorkflowEngine。
- 统一 pass threshold 和 rewrite round 规则：当前文档/模板和执行代码不一致。
- 决定 canonical story path：文档偏向 `stories/{YYYYMMDD}/{slug}/`，Dashboard 同时维护 `stories/{story_id}/`。
- 明确 System Health：要么实现真实模块和 report writer，要么从当前完成状态中移除。
- 更新过时的 `dashboard/README.md`，它仍然描述早期“不实现 Web Dashboard”的状态。

执行可靠性：

- 为 WorkflowEngine mock path 加测试：artifact 创建、QA rewrite loop、manifest、trace、state、runs log。
- 为 DeepSeek/OpenAI provider 加 request shape 测试，避免打真实 API。
- 为真实 agent 模式增加 LLM JSON/Markdown 输出校验。
- 明确 Recorder 是独立 runtime agent，还是由 WorkflowEngine 负责 logging。
- 等模型定价确定后实现成本计算。

Dashboard 可靠性：

- 确定包管理策略并提交 lockfile。
- 安装依赖后验证 `next build`。
- 检查 UI 文案和文档的编码一致性。
- 当 provider 是 `deepseek` 但缺少 `DEEPSEEK_API_KEY` 时，提供更明确的 UI 错误状态。
- 只有在 System Health 模块存在后，再增加 health/report 面板。

数据与迁移：

- 对齐 `metrics/schema.sql` 和 `scripts/dashboard_store.py` 中 dashboard-only 表。
- 决定 `metrics/runs.jsonl` 是否彻底作为 runtime-only 文件处理。
- 只有本地执行闭环稳定后，再考虑 SQLite 到 Postgres 的迁移。

Provider 路线：

- DeepSeek 是后续优先使用的 API provider。
- OpenAI provider 保留支持。
- Claude provider 当前只是占位。
- 不要把 API key 写入仓库文件；只使用环境变量。

产品约束：

- 执行闭环稳定前，不继续堆 Dashboard 复杂度。
- 不新增 Topic Planning、Diversity、Ranking 业务 agent。
- 暂不接发布平台。
- 暂不开发 Knowledge、Prompt Evolution 自动化或 SaaS 多用户系统。

# Story Forge 项目状态

更新时间：2026-07-02

这个文件是 Story Forge 的“大脑记忆”。新窗口或新的 Codex 会话接手前，先读这里，再读 `README.md`、`AGENTS.md` 和核心代码。

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


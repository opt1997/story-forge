# Story Forge V1.5

Story Forge V1.5 是一个面向短故事生产的“自动内容策划 + 自动故事生产系统”规格骨架。它在 V1 的 Story Manager 调度流程前新增 Content Planning Layer，使系统不再只是按用户指定题材写故事，而是先读取历史、制定今日策略、生成候选选题、过滤重复、排序选题，再把 Top N 送入原有故事生产流程。

V1.5 的文档骨架仍然保留。M2 起项目已经新增可运行 Workflow Engine，M3 起新增最小网页入口；默认仍使用 mock provider，只有显式配置后才调用真实 OpenAI 或 DeepSeek API。

## 用户体验

用户最终只需要一个动作：

```text
开始今天创作
```

Story Manager 自动完成：

1. 读取 `stories/`、`metrics/`、`planning/` 和可选 `knowledge/`。
2. 分析最近 7 天和最近 30 天的题材分布、重复、质量和空缺。
3. 生成或更新 `planning/today.json`。
4. 内部完成 Topic Planning，生成 30 到 50 个候选选题。
5. 内部完成 Diversity Filtering，避免近期重复和题材疲劳。
6. 内部完成 Story Ranking，选择 Top N。
7. 只把 Top N 送入 Idea → Outline → Writer → QA → Rewrite 流程。
8. 通过 QA 后确认 `final.md`，未通过则标记 `needs_human_review`。
9. 每个非 Recorder 阶段完成后调度 Recorder 记录 metrics。
10. 条件满足时调度 Evolver 输出 proposal。

## 目录说明

```text
AGENTS.md
agents/
rules/
prompts/
planning/
stories/
templates/
scripts/
metrics/
dashboard/
```

- `agents/`：Story Manager 和各子 agent 的职责、输入、输出、禁止事项和产物格式。
- `rules/`：写作、节奏、评分、禁忌和格式等稳定约束。
- `prompts/`：版本化 LLM prompt 模板，使用 `vN.md` 管理。
- `prompts/_proposals/`：Evolver 生成的改进建议，只供用户审核。
- `planning/`：Content Planning Layer 的规划产物，包括 `today.json`、`weekly.json`、`monthly.json` 和 `strategy.md`。
- `stories/`：故事产物目录，按 `stories/{YYYYMMDD}/{slug}/` 存放。
- `templates/`：故事运行状态模板，例如 `story_manifest.template.json`。
- `scripts/`：流程说明文档和本地执行入口。
- `metrics/`：运行记录 schema、JSONL 占位和查询说明。
- `dashboard/`：V1.5 看板占位说明；当前不开发 Dashboard。

## 运行观念

V1.5 的“运行”仍然是流程约定，而不是代码自动执行。Story Manager 是唯一入口，用户不直接调用 Idea、Outline、Writer、QA、Rewrite、Recorder 或 Evolver。

示例任务：

```text
开始今天创作
```

Story Manager 驱动流程：

1. Story Manager 接收用户任务，进入今日创作流程。
2. Story Manager 读取历史数据和规划资料。
3. Story Manager 生成 `planning/today.json`，并参考 `planning/weekly.json`、`planning/monthly.json` 和 `planning/strategy.md`。
4. Story Manager 内部生成候选选题池，完成多样性过滤和综合排序。
5. Story Manager 选择 Top N，才为每篇故事创建 `story_id`、故事目录和 `story_manifest.json`。
6. Story Manager 调度 Idea 生成正式 `idea.json`。
7. Story Manager 调度 Outline 生成 `outline.json`。
8. Story Manager 调度 Writer 生成初稿 `draft_v1.md`。
9. Story Manager 调度 QA 生成对应轮次的 `qa_v1.json`。
10. 不通过则 Story Manager 调度 Rewrite 局部修复，最多 2 次返工，依次生成 `draft_v2.md`、`draft_v3.md`。
11. 每次返工后再次 QA，最多 3 次 QA evaluation cycle：`qa_v1.json`、`qa_v2.json`、`qa_v3.json`。
12. 通过或达到上限后，将已通过 QA 的当前 draft 原样确认为 `final.md`，或标记 `needs_human_review`。
13. 每个非 Recorder 阶段完成后，Story Manager 调度 Recorder 记录 metrics。
14. 条件满足时，Story Manager 调度 Evolver 输出 proposal；Evolver 不自动修改 prompt 或 rules。

详细流程见 `scripts/run_story_pipeline.md` 和 `scripts/evolve_prompts.md`。

## 为什么不新增多个业务 Agent

V1.5 不新增 TopicPlannerAgent、DiversityAgent 或 RankingAgent。原因是这些能力都属于“今天应该生产什么”的上游决策，而不是独立的故事产物生产阶段。把它们收敛在 Story Manager 内部，可以避免多 agent 之间互相传递半成品策略，减少状态分裂，也能保证“开始今天创作”这个单入口体验足够清晰。

原有 agent 仍专注自己的稳定职责：Idea 负责正式创意文件，Outline 负责结构，Writer 负责正文，QA 负责评分，Rewrite 负责局部修复，Recorder 负责记录，Evolver 负责 proposal。

## 命名规则

- `story_id = {YYYYMMDD}-{slug}`。
- `slug` 由正式 `idea.title` 生成，使用小写英文、数字和连字符，最长 30 字符。
- 每篇故事目录为 `stories/{YYYYMMDD}/{slug}/`。
- 每篇故事维护 `story_manifest.json`，记录当前状态、当前 draft、当前 QA、轮次、分数、文件路径、prompt 版本和 metrics 汇总。
- V1.5 默认通过阈值为 90，由 `story_manifest.json` 的 `pass_threshold` 表达。

## 硬限制

- 不接入番茄小说。
- 不自动发布。
- 不绕过任何网站风控。
- 默认不调用 AI API；只有设置 `STORY_FORGE_LLM_PROVIDER=openai` / `deepseek` 或运行 `--provider=openai` / `--provider=deepseek`，并提供对应 API key 后才会调用真实模型 API。
- 不新增 Topic Planning、Diversity Filtering 或 Story Ranking 的独立业务 agent。
- Story Manager V1.5 仍然只是文档化调度设计，不实现真实自动执行。
- Evolver 的建议必须由用户审核后手动升版，禁止自动覆盖已有规则和 prompt。

## 验证方式

可用以下方式检查 V1.5 骨架：

```powershell
rg --files
```

确认 agent、rules、prompts、planning、templates、scripts、metrics、dashboard、core 执行层文件都存在且非空。

## M3.1 Web Dashboard

M3.1 提供最小可用网页后台，用户可以在首页点击“开始今天创作”，触发现有 M2 mock Workflow Engine，并查看 Pipeline 状态、生成文件和 System Health 结果。

本地启动：

```powershell
pnpm install
pnpm dev
```

打开：

```text
http://localhost:3000
```

M3.1 默认不调用真实 AI API；若启动前设置 `STORY_FORGE_LLM_PROVIDER=openai` / `deepseek` 和对应 API key，点击“开始今天创作”会通过 Execution Architecture 调用真实模型。M3.1 不接入发布平台，不开发用户系统、复杂图表、prompt 编辑器或 metrics 分析页。

## Real AI Execution Architecture

当前执行架构采用 mock → real 渐进升级。默认使用 mock provider，显式切换后可调用真实 OpenAI Responses API 或 DeepSeek Chat API。

```powershell
node scripts/run_ai_execution.js --provider=mock
```

真实 OpenAI 执行：

```powershell
$env:OPENAI_API_KEY="sk-..."
$env:STORY_FORGE_LLM_PROVIDER="openai"
$env:STORY_FORGE_OPENAI_MODEL="gpt-5.5"
npm run exec:openai
```

真实 DeepSeek 执行：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
$env:STORY_FORGE_LLM_PROVIDER="deepseek"
$env:STORY_FORGE_DEEPSEEK_MODEL="deepseek-v4-flash"
npm run exec:deepseek
```

Dashboard 使用同一开关：

```powershell
$env:DEEPSEEK_API_KEY="sk-..."
$env:STORY_FORGE_LLM_PROVIDER="deepseek"
pnpm dev
```

可选模型配置：

```powershell
$env:STORY_FORGE_OPENAI_IDEA_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_OUTLINE_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_WRITER_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_QA_MODEL="gpt-5.5"
$env:STORY_FORGE_OPENAI_REWRITE_MODEL="gpt-5.5"
```

DeepSeek 可选模型配置：

```powershell
$env:STORY_FORGE_DEEPSEEK_IDEA_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_OUTLINE_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_WRITER_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_QA_MODEL="deepseek-v4-flash"
$env:STORY_FORGE_DEEPSEEK_REWRITE_MODEL="deepseek-v4-flash"
```

DeepSeek 可选推理配置：

```powershell
$env:DEEPSEEK_THINKING_TYPE="enabled"
$env:DEEPSEEK_REASONING_EFFORT="high"
```

不要把 `OPENAI_API_KEY` 或 `DEEPSEEK_API_KEY` 写入仓库文件；`.env*` 已被 `.gitignore` 忽略。

执行层次：

```text
Story Manager plan
Workflow Engine
Agent Runtime
LLM Provider
Mock LLM / OpenAI Responses API / DeepSeek Chat API
```

本阶段新增 execution trace、agent input/output log 和 pipeline state tracking。OpenAI Provider 与 DeepSeek Provider 已接入；Claude Provider 仍是占位，不会调用外部 API。

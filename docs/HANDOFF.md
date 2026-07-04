# Story Forge 上下文交接文档

更新时间：2026-07-04

本文用于新的 Codex 窗口快速恢复 Story Forge 当前项目上下文。请以当前 Git 代码、`AGENTS.md`、`PROJECT_STATE.md` 和本目录文档为事实来源，不要凭历史对话补全事实。

## 1. 项目目标

Story Forge 是一个面向短故事生产的本地内容运营系统。项目目标是把“每天应该写什么”和“如何自动生产故事”合并成一个可操作的工作台：

- 上游由 Story Manager 概念层负责历史分析、主题策划、候选主题生成、去重、多样性过滤和排序。
- 下游由 Idea、Outline、Writer、QA、Rewrite 等 agent/执行阶段完成故事生产。
- Dashboard 提供本地可用的操作入口、任务队列、作品库和指标回填。

当前阶段目标是：完成一个基本可用的本地 Dashboard，让用户可以点击“开始创作”或“用此主题生成”，生成任务、查看任务、查看完成作品，并把 `read_count` / `drop_off_users` 回写到本地作品文件。

## 2. 当前页面结构

当前产品信息架构应包含以下模块：

- 今日创作：用户启动每日创作的入口。当前 UI 文案已改为“开始创作”。
- 推荐主题：展示今日推荐主题，支持刷新主题和用指定主题生成任务。
- 任务队列：展示最近任务，支持单任务删除/取消和一键清空。
- 作品库：从本地 `stories/` 文件夹读取已完成作品，支持分页、详情查看、指标保存和打开文件夹。
- 数据复盘：用于后续展示阅读量、流失、题材表现等复盘结果。当前尚未作为独立导航页落地。
- 系统设置：用于后续承载 provider、模型、路径和运行模式设置。当前尚未作为独立导航页落地。

当前代码中的左侧导航实际为：`开始创作`、`推荐主题`、`任务队列`、`作品库`。因此“数据复盘”和“系统设置”是当前规格中的待补齐模块，不应在文档中误写为已经完成。

## 3. 当前已经完成的功能

### 推荐主题生成与展示

- Dashboard 会通过后端生成候选主题。
- 后端保留 30 个候选主题。
- 前端展示 Top 5。
- 支持刷新主题。
- 支持点击“用此主题生成”创建新任务。

### 当前任务展示

- 任务队列展示最新任务。
- 最新任务位于上方。
- 当前任务区只展示最近 5 条。
- 支持单任务删除/取消。
- 支持“一键清空”。
- 右侧栏可以展示任务详情，包括当前阶段、状态、轮次、pipeline 和文件状态。

### 作品库展示

- 作品库读取本地 `stories/` 文件夹。
- 完成作品会整理为可展示的本地作品目录。
- 作品库主区展示标题、日期、短摘要、作品 ID、指标输入和操作按钮。
- 右侧栏可以展示作品详情、摘要、标签、QA 分数、返工次数、阅读量、触底人数和正文预览。
- 作品库支持分页，每页 10 篇。
- 支持打开整个 `stories/` 文件夹。
- 支持打开单篇作品目录。

### 本地 stories 文件夹读取

作品库必须以本地 `stories/` 为主要数据源。数据库可以作为索引或缓存，但不能替代本地故事文件。

当前 Dashboard 使用扁平作品目录作为作品库来源，例如：

```text
stories/20260703-topic-0/
stories/20260703-topic-0-2/
```

核心 Workflow 仍可能生成嵌套目录：

```text
stories/{YYYYMMDD}/{slug}/
```

Dashboard runtime 会把通过的故事整理/复制为扁平作品库目录。

### story.meta.json 规则

只有满足以下条件的文件夹才进入作品库：

- 包含 `story.meta.json`
- 包含 `final.md`
- `story.meta.json.type === "story"`
- `story.meta.json.status === "done"`

如果历史作品只有旧版 `meta.json`，runtime 可能尝试 backfill 生成 `story.meta.json`，但新开发不应依赖旧格式。

### read_count / drop_off_users 保存

- 作品库中的 `read_count` 和 `drop_off_users` 可编辑。
- 保存后会写回对应作品目录下的 `story.meta.json`。
- 若存在旧版 `meta.json`，当前 runtime 也会同步更新兼容字段。
- 保存后会更新本地 dashboard store，并触发 `knowledge/feedback_learning.json` 的小步学习记录。

### DeepSeek 接入状态

- DeepSeek provider 已接入。
- 通过 `STORY_FORGE_LLM_PROVIDER=deepseek` 和 `DEEPSEEK_API_KEY` 启用。
- 支持 `DEEPSEEK_BASE_URL`、`STORY_FORGE_DEEPSEEK_MODEL` 以及按 agent 配置模型。
- 不允许把真实 API key 写入仓库。
- Claude provider 当前仍是占位，不应当作可用真实 provider。

## 4. 当前未完成或待确认事项

- 数据复盘模块尚未作为独立导航页落地。
- 系统设置模块尚未作为独立导航页落地。
- `PROJECT_STATE.md` 中有部分历史记录可能仍描述旧状态，例如曾记录 `qaThreshold: 85`、`maxRewriteRounds: 3`；当前核心 `WorkflowEngine` 已使用 `qaThreshold: 90` 和 `maxRewriteRounds: 2`。
- Story Manager 尚未完全独立 agent 化；当前规划能力主要由 `scripts/story_strategy.js` 和 `scripts/dashboard_runtime.js` 承担。
- Recorder 当前不是独立 runtime agent；日志由 Workflow/Dashboard runtime、SQLite、JSONL 和 progress log 承担。
- Evolver 当前不自动介入 Dashboard 生产流程，只能输出 proposal 或学习建议，不自动改 prompt/rules。
- 自动化测试尚未系统化落地，目前以手动验收和 `npm run build` 为主。

## 5. 当前架构约束

- 不允许随意新增 Agent。
- 不允许重构 Workflow。
- 不允许把 UI 做成纯 mock；页面必须连接当前本地 runtime/API/文件系统数据。
- 作品库必须以本地 `stories/` 文件夹为主要数据源。
- 数据库可以作为索引或缓存，但不能替代本地故事文件。
- 不允许把真实 API key、token、cookie、私钥或生产凭据写入仓库。
- Prompt 升版必须由用户审核后手动新增版本，不能自动覆盖旧 prompt。
- Evolver 只能输出 proposal，不能自动覆盖规则或 prompt。

## 6. 新窗口继续开发时应该先读哪些文件

建议按顺序读取：

1. `docs/HANDOFF.md`
2. `docs/CURRENT_SPEC.md`
3. `docs/TEST_PLAN.md`
4. `docs/ACCEPTANCE_CHECKLIST.md`
5. `AGENTS.md`
6. `PROJECT_STATE.md`
7. `README.md`
8. `app/page.js`
9. `scripts/dashboard_runtime.js`
10. `scripts/story_strategy.js`
11. `core/workflow/workflow-engine.ts`
12. `core/runtime/agent-registry.ts`

如果要确认作品库逻辑，优先读：

- `scripts/dashboard_runtime.js`
- `app/api/library/stories/route.js`
- `app/api/library/stories/[story_id]/metrics/route.js`
- `app/api/folders/open/route.js`

## 7. 当前不要做的事

- 不要接番茄小说后台或任何第三方发布平台。
- 不要自动发布内容。
- 不要新增复杂图表。
- 不要重构 Story Manager。
- 不要修改 Agent 架构。
- 不要新增 TopicPlannerAgent、DiversityAgent、RankingAgent。
- 不要把作品库改成只读数据库。
- 不要删除或覆盖用户已有的 `stories/` 文件。
- 不要把真实 DeepSeek/OpenAI key 写入 tracked 文件。

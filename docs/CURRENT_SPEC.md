# Story Forge 当前产品规格

更新时间：2026-07-04

本文描述 Story Forge 当前基本可用阶段的产品规格。它用于指导后续开发、验收和新 Codex 窗口恢复上下文。

## 1. 系统流程总览

Story Forge 当前流程：

```text
用户打开 Dashboard
  -> 浏览推荐主题或点击开始创作
  -> Dashboard API 创建 run/task
  -> Story strategy 读取 stories/、metrics/、planning/、knowledge/
  -> 生成或复用 planning/today.json
  -> 后端生成 30 个候选主题并排序
  -> 前端展示 Top 5
  -> 选中主题或默认策略进入故事生产
  -> Idea -> Outline -> Writer -> QA -> Rewrite -> QA -> Final
  -> 完成作品写入 stories/
  -> 作品库从 stories/ 读取 story.meta.json + final.md
  -> 用户回填 read_count / drop_off_users
```

## 2. 页面规格

Dashboard 应包含：

- 左侧导航
- 顶部操作区
- 推荐主题区
- 当前任务区
- 作品库
- 右侧今日概览

### 2.1 左侧导航

当前项目已落地的左侧导航项：

- 开始创作
- 推荐主题
- 任务队列
- 作品库

后续可规划但当前未落地为独立导航的模块：

- 数据复盘
- 系统设置

说明：当前项目实现以 `开始创作 / 推荐主题 / 任务队列 / 作品库` 为准。数据复盘和系统设置只作为后续规划方向记录，不属于当前已完成页面。后续补齐时应保持现有 Dashboard 数据源和架构约束，不要改成纯 mock 页面。

### 2.2 顶部操作区

顶部操作区包含：

- 产品标题：故事工坊
- 主操作按钮：开始创作

不应展示旧版右上角“刷新”按钮。

### 2.3 推荐主题区

推荐主题区展示今日推荐主题 Top 5，并提供刷新主题按钮。

### 2.4 当前任务区

当前任务区展示最新 5 条任务，最新任务在最上方。

### 2.5 作品库

作品库展示来自本地 `stories/` 文件夹的完成作品，并支持分页、指标编辑、保存和打开文件夹。

### 2.6 右侧今日概览

右侧默认展示今日创作概览。选中作品后切换为作品详情，选中任务后切换为任务详情。

## 3. 推荐主题规格

- 后台实际生成 30 个候选主题。
- 前端只展示 5 个。
- 支持刷新主题。
- 刷新后应重新生成候选池并更新前端 Top 5。
- 刷新页面后，推荐主题仍然可读取。
- 每个主题至少包含：
  - `title`
  - `summary`
  - `genre`
  - `tags`
  - `heat_score`
  - `quality_score`
- 当前实现中主题对象可能还包含候选 ID、排序、题材、商业角度、写作技巧等字段。
- 点击“用此主题生成”会创建新任务。
- 新任务进入任务队列，并应保留旧任务，不覆盖已有任务。

## 4. 当前任务规格

- 当前任务只展示最新 5 条。
- 最新任务在最上面。
- 支持一键清空。
- 支持删除/取消单个任务。
- 被删除或清空的任务不应在刷新页面后重新出现。
- 任务状态包括：
  - `pending`
  - `running`
  - `done`
  - `failed`
  - `cancelled`
- 阶段包括：
  - `Idea`
  - `Outline`
  - `Writer`
  - `QA`
  - `Rewrite`
  - `Final`
  - `Done`
- Writer / QA / Rewrite 需要展示轮次，例如：
  - `Writer(2)`
  - `QA(2)`
  - `Rewrite(1)`

任务主区应保持摘要式展示，不应把完整 pipeline、正文预览或大量文件状态塞进主区。完整信息应放在右侧任务详情中。

## 5. 作品库规格

- 作品库必须从本地 `stories/` 文件夹读取。
- 每篇作品一个文件夹。
- 每个作品文件夹必须包含 `story.meta.json`。
- 每个作品文件夹必须包含 `final.md`。
- 只有 `story.meta.json.type === "story"` 且 `story.meta.json.status === "done"` 的文件夹才进入作品库。
- 作品库每页展示 10 篇。
- 作品库按 `created_at` 倒序排列。
- 作品库主区应展示：
  - 标题
  - 作品文件夹 ID
  - 日期
  - 短摘要
  - `read_count`
  - `drop_off_users`
  - 保存按钮
  - 打开作品文件夹按钮
- 作品库头部应支持打开整个 `stories/` 文件夹。
- `read_count` / `drop_off_users` 可编辑并写回 `story.meta.json`。
- 数据库可以缓存或索引作品数据，但不能替代 `stories/` 文件夹和作品文件。

## 6. story.meta.json 规格

标准结构：

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

字段说明：

- `type`：必须为 `"story"` 才能进入作品库。
- `story_id`：作品唯一 ID，通常与文件夹名一致。
- `title`：作品标题。
- `summary`：作品摘要。
- `tags`：作品标签数组。
- `genre`：题材类型。
- `status`：必须为 `"done"` 才能进入作品库。
- `created_at`：创建时间，用于倒序排序。
- `updated_at`：最后更新时间。
- `read_count`：人工回填或系统记录的阅读量。
- `drop_off_users`：人工回填或系统记录的触底/流失人数。
- `qa_score`：QA 分数，可为 `null`。
- `rewrite_count`：返工次数。
- `source`：来源，当前默认 `"story-forge"`。

## 7. Provider 规格

- 默认 provider 为 `mock`。
- 设置 `STORY_FORGE_LLM_PROVIDER=openai` 后可使用 OpenAI provider。
- 设置 `STORY_FORGE_LLM_PROVIDER=deepseek` 后可使用 DeepSeek provider。
- DeepSeek 需要 `DEEPSEEK_API_KEY`。
- 不得将真实 API key 写入仓库。
- Claude provider 当前是占位，不应视为已可用真实 provider。

## 8. 架构限制

- 不新增业务 Agent。
- 不新增 TopicPlannerAgent、DiversityAgent 或 RankingAgent。
- 不重构核心 Workflow。
- 不把 UI 做成纯 mock。
- 不绕过本地 `stories/` 文件夹。
- 不自动发布。
- 不自动覆盖 prompt 或 rules。

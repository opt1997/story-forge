# Content Planning Strategy

`planning/strategy.md` 说明 Story Manager 如何在正式写作前制定内容策略。它不是执行脚本，也不调用 AI API。

## 目标

Story Forge V1.5 的目标不是简单地“自动写故事”，而是先判断今天应该生产什么，再启动原有故事生产流程。

Story Manager 需要把用户的 `开始今天创作` 转化为：

1. 今日题材组合。
2. 需要避免的重复题材。
3. 需要补足或提升的题材方向。
4. 候选选题池。
5. 经过多样性过滤和排序后的 Top N。

## 输入

Story Manager 制定策略时读取：

- `stories/`：检查最近故事的题材、标题、核心冲突、反转类型、最终状态和最终稿。
- `metrics/`：检查运行成本、耗时、QA 分数、prompt 版本和阶段表现。
- `planning/today.json`：当天计划和候选池。
- `planning/weekly.json`：本周题材轮换和质量目标。
- `planning/monthly.json`：长期内容方向、实验题材和风险观察。
- `knowledge/`：可选知识沉淀目录。若不存在或为空，则视为暂无额外知识输入。

## 历史分析

Story Manager 至少分析两个窗口：

- 最近 7 天：用于发现短期重复、题材疲劳、连续生成风险和近期空缺。
- 最近 30 天：用于发现中期分布、高分题材、低分题材和长期空缺。

分析重点：

- 最近生成了哪些题材。
- 哪些题材连续出现或核心冲突高度相似。
- 哪些题材 QA 分数高，适合保留为主力方向。
- 哪些题材低分，应该暂停、修复或只做小规模实验。
- 哪些题材最近没有生成，适合作为多样性补位。

## 今日策略

Story Manager 更新 `planning/today.json` 时，应写明：

- 今天计划创作的题材。
- 每种题材的目标数量。
- 需要避免的题材、场景、人物关系或反转类型。
- 需要提升的方向，例如开场钩子、冲突密度、情绪落点或结尾余味。
- 每个决策的原因。

## Topic Planning

Topic Planning 是 Story Manager 的内部能力，不是新 agent。

Story Manager 一次生成 30 到 50 个候选选题。候选选题应包含：

- `candidate_id`
- `working_title`
- `genre`
- `core_conflict`
- `twist_type`
- `emotional_hook`
- `platform_fit_notes`
- `risk_notes`

这些候选只写入 `planning/today.json.topic_candidates`，不等同于正式 `idea.json`。

## Diversity Filtering

Diversity Filtering 是 Story Manager 的内部能力，不是新 agent。

过滤时不仅检查题材名，还要检查：

- 主角身份是否重复。
- 核心冲突是否重复。
- 关键场景是否重复。
- 人物关系是否重复。
- 反转机制是否重复。
- 情绪落点是否重复。
- 最近 7 天是否出现相同组合。

被剔除的候选应记录剔除原因，写入 `planning/today.json.diversity_filter.removed_candidates`。

## Story Ranking

Story Ranking 是 Story Manager 的内部能力，不是新 agent。

推荐评分维度：

| 维度 | 含义 |
| --- | --- |
| `innovation` | 是否有新鲜设定或新角度 |
| `conflict` | 主冲突是否清晰、强烈、可持续 |
| `twist` | 反转是否有潜力且不生硬 |
| `platform_fit` | 是否适合目标短故事阅读场景 |
| `hook` | 开场和爽点是否足够明确 |
| `emotion` | 情绪推进和结尾余味是否成立 |
| `diversity_bonus` | 是否补足近期题材空缺 |
| `repetition_penalty` | 是否与近期故事过度相似 |

Story Manager 选择 Top N 后，写入 `planning/today.json.selected_top_n`。只有这些选题可以进入正式 Idea 阶段。

## 与原 Pipeline 的关系

Content Planning Layer 只决定“今天写什么”和“哪些选题进入生产”。它不替代原有故事生产 pipeline。

正式生产仍然是：

```text
Idea -> Outline -> Writer -> QA -> Rewrite -> QA -> Recorder -> Evolver
```

`final.md` 仍只能来自通过 QA 的当前 draft。Recorder 仍避免记录自己的阶段。Evolver 仍只输出 proposal，不自动覆盖 `rules/` 或 `prompts/`。

## 未来扩展

未来可以接入热点分析、搜索趋势、历史阅读数据、平台表现和用户反馈，但这些都应作为 Story Manager 的策略输入，而不是新增业务 agent。

推荐扩展方式：

- 热点分析：写入 `knowledge/` 或 planning 输入摘要，由 Story Manager 读取。
- 搜索趋势：作为题材机会和疲劳风险的参考。
- 历史阅读数据：用于更新题材质量和平台适配判断。
- 平台表现：用于修正 `platform_fit` 和 `hook` 评分。
- 用户偏好：用于调整 `weekly.json` 和 `monthly.json` 的目标分布。

这样可以保持系统单入口、状态集中、agent 边界清晰，并避免把上游策略拆成多个互相依赖的半自动流程。

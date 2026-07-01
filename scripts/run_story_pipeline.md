# run_story_pipeline 流程说明

本文件只描述 Story Forge V1.5 的 Story Manager 驱动流程，不是可执行脚本。V1.5 禁止在此处写 Python、JavaScript、TypeScript 或其他真实 pipeline 代码。

## 核心原则

- Story Manager 是唯一入口；用户不直接调用 Idea、Outline、Writer、QA、Rewrite、Recorder 或 Evolver。
- 用户最终体验是点击或输入 `开始今天创作`。
- Story Manager 不应直接开始 Idea；必须先完成 Content Planning Layer。
- Topic Planning、Diversity Filtering 和 Story Ranking 是 Story Manager 的内部能力，不新增独立业务 agent。
- Story Manager 只做内容策划、调度、检查文件、维护 `planning/today.json`、维护 `story_manifest.json` 和状态，不直接写正文，不直接修改任何子 agent 的内容产物。
- `final.md` 只能来自已经通过 QA 的当前 draft，允许作为“通过稿确认副本”存在，不允许 Story Manager 借 final 步骤重写正文。
- Recorder 只记录非 Recorder 阶段，绝不记录自己的 recorder 阶段。
- Evolver 只在触发条件满足时输出 proposal，禁止自动覆盖 `rules/` 或 `prompts/`。

## V1.5 Story Manager 驱动流程

1. 用户向 Story Manager 下达任务：`开始今天创作`。
2. Story Manager 读取 `stories/`、`metrics/`、`planning/` 和可选 `knowledge/`。
3. Story Manager 分析最近 7 天的题材重复、连续生成、质量波动和空缺题材。
4. Story Manager 分析最近 30 天的题材分布、高质量题材、低分题材、疲劳题材和长期空缺。
5. Story Manager 参考 `planning/weekly.json`、`planning/monthly.json` 和 `planning/strategy.md` 制定今日策略。
6. Story Manager 生成或更新 `planning/today.json`，写明今天计划创作的题材、数量、需要避免的题材、需要提升的方向和原因。
7. Story Manager 内部执行 Topic Planning，一次生成 30 到 50 个候选选题，并写入 `planning/today.json.topic_candidates`。
8. Story Manager 内部执行 Diversity Filtering，剔除近期重复、连续多天相似、冲突同质、场景同质或反转同质的候选，并写入 `planning/today.json.diversity_filter`。
9. Story Manager 内部执行 Story Ranking，根据创新度、冲突、反转、平台适配、爽点、情绪、多样性加分和近期重复扣分综合评分，并写入 `planning/today.json.ranking`。
10. Story Manager 选择 Top N，并写入 `planning/today.json.selected_top_n`。
11. Story Manager 只对 Top N 选题启动正式故事生产流程；未入选候选不得进入 Idea。
12. 对每个 Top N 选题，Story Manager 创建 `story_id = {YYYYMMDD}-{slug}`、故事目录 `stories/{YYYYMMDD}/{slug}/`，并基于 `templates/story_manifest.template.json` 初始化 `story_manifest.json`。
13. Story Manager 将 `story_manifest.json.status` 设为 `idea_pending`，调度 Idea Agent，并把入选选题约束传递给 Idea Agent。
14. Idea Agent 读取 `rules/style.md`、`rules/taboo.md` 和最新版 `prompts/style/v*.md`，生成正式 `idea.json`。
15. Story Manager 检查 `idea.json` 存在，并更新 manifest 中的 `title`、`genre`、`slug`、`files.idea`、`updated_at`；随后调度 Recorder 记录 `idea` 阶段。
16. Story Manager 将状态设为 `outlining`，调度 Outline Agent。
17. Outline Agent 读取 `idea.json`、`rules/style.md`、`rules/pacing.md`，生成 `outline.json`。
18. Story Manager 检查 `outline.json` 存在，更新 `files.outline` 和 `updated_at`；随后调度 Recorder 记录 `outline` 阶段。
19. Story Manager 将状态设为 `writing`，调度 Writer Agent。
20. Writer Agent 读取 `idea.json`、`outline.json`、`rules/style.md`、`rules/format.md` 和最新版 `prompts/style/v*.md`，生成初稿 `draft_v1.md`。
21. Story Manager 检查 `draft_v1.md` 存在，更新 `current_draft`、`files.draft_v1`、`rewrite_round = 0`、`updated_at`；随后调度 Recorder 记录 `writer` 阶段。
22. Story Manager 将状态设为 `qa_v1`，调度 QA Agent 执行第 1 次 QA evaluation cycle。
23. QA Agent 读取 `idea.json`、`outline.json`、`draft_v1.md`、`rules/scoring.md` 和最新版 `prompts/scoring/v*.md`，使用至少 2 个不同模型 judge 的保守分生成 `qa_v1.json`。
24. Story Manager 检查 `qa_v1.json` 存在，更新 `current_qa`、`files.qa_v1`、`qa_round = 1`、`final_score`、`updated_at`；随后调度 Recorder 记录 `qa` 阶段。
25. 若 `qa_v1.json.final_scores.total >= story_manifest.json.pass_threshold`，Story Manager 将已通过 QA 的 `draft_v1.md` 确认为 `final.md`，更新 `files.final` 和 `status = passed`，并结束该故事写作流程。
26. 若 `qa_v1.json` 未通过，Story Manager 将状态设为 `rewrite_v1`，调度 Rewrite Agent。
27. Rewrite Agent 读取 `draft_v1.md`、`qa_v1.json`、`outline.json`，只按 QA 扣分原因做局部修改，生成 `draft_v2.md`。
28. Story Manager 检查 `draft_v2.md` 存在，更新 `current_draft`、`files.draft_v2`、`rewrite_round = 1`、`updated_at`；随后调度 Recorder 记录 `rewrite` 阶段。
29. Story Manager 将状态设为 `qa_v2`，调度 QA Agent 对 `draft_v2.md` 生成 `qa_v2.json`；完成后更新 `current_qa`、`files.qa_v2`、`qa_round = 2`、`final_score`，并调度 Recorder 记录 `qa` 阶段。
30. 若 `qa_v2.json` 通过，Story Manager 将已通过 QA 的 `draft_v2.md` 确认为 `final.md`，更新 `files.final` 和 `status = passed`，并结束该故事写作流程。
31. 若 `qa_v2.json` 仍未通过，Story Manager 将状态设为 `rewrite_v2`，调度 Rewrite Agent 读取 `draft_v2.md`、`qa_v2.json`、`outline.json`，生成 `draft_v3.md`；随后更新 manifest 并调度 Recorder 记录 `rewrite` 阶段。
32. Story Manager 将状态设为 `qa_v3`，调度 QA Agent 对 `draft_v3.md` 生成 `qa_v3.json`；完成后更新 `current_qa`、`files.qa_v3`、`qa_round = 3`、`final_score`，并调度 Recorder 记录 `qa` 阶段。
33. 若 `qa_v3.json` 通过，Story Manager 将已通过 QA 的 `draft_v3.md` 确认为 `final.md`，更新 `files.final` 和 `status = passed`。
34. 若 `qa_v3.json` 仍未通过，Story Manager 将 `status` 标记为 `needs_human_review`，不再调度 Rewrite，也不生成新的正文版本。
35. 每篇故事结束后，Story Manager 汇总 manifest 中的成本、耗时、token、prompt 版本和最终状态。
36. Story Manager 根据 `metrics/runs.jsonl` 和最近故事数量判断是否触发 Evolver；若触发，Evolver 只写 `prompts/_proposals/{YYYYMMDD}-proposal.md`，等待用户审核后手动升版。

## planning 文件更新点

- 每次今日流程开始时，Story Manager 更新 `planning/today.json.status`。
- 历史读取完成后，写入最近 7 天和最近 30 天的分析摘要。
- 今日策略生成后，写入计划题材、数量、避免题材、提升目标和原因。
- Topic Planning 完成后，写入 `topic_candidates`。
- Diversity Filtering 完成后，写入过滤规则、保留候选和剔除原因。
- Story Ranking 完成后，写入候选评分、排序结果和 `selected_top_n`。
- `planning/weekly.json` 和 `planning/monthly.json` 由 Story Manager 周期性或用户要求时更新；V1.5 不提供自动定时器。
- `planning/strategy.md` 是策略说明文档，不由 Evolver 自动覆盖。

## story_manifest.json 更新点

- 初始化时写入 `story_id`、`date`、`slug`、`status`、`pass_threshold`、`created_at`、`updated_at`。
- 每个阶段开始前更新 `status`。
- 每个阶段完成后更新对应 `files.*`、`current_draft` 或 `current_qa`。
- 每次 QA 后更新 `qa_round`、`final_score` 和状态判断依据。
- 每次 rewrite 后更新 `rewrite_round`，最多为 2。
- 每次 Recorder 完成后更新 manifest 的 metrics 汇总字段，但 Recorder 不记录自己的执行。

## 状态流转

```text
history_analyzing -> today_planning -> topic_planning -> diversity_filtering -> story_ranking -> top_n_selected
top_n_selected -> idea_pending -> outlining -> writing -> qa_v1
qa_v1 -> passed
qa_v1 -> rewrite_v1 -> qa_v2
qa_v2 -> passed
qa_v2 -> rewrite_v2 -> qa_v3
qa_v3 -> passed
qa_v3 -> needs_human_review
```

## 产物目录

每篇故事必须使用：

```text
stories/{YYYYMMDD}/{slug}/
```

目录内常见产物：

```text
story_manifest.json
idea.json
outline.json
draft_v1.md
qa_v1.json
draft_v2.md
qa_v2.json
draft_v3.md
qa_v3.json
final.md
```

规划层产物：

```text
planning/today.json
planning/weekly.json
planning/monthly.json
planning/strategy.md
```

## 禁止事项

- 不自动发布。
- 不接入番茄小说。
- 不绕过任何网站风控。
- 不在 V1.5 中实现真实执行代码。
- 不调用 AI API；本文档只定义调度协议。
- 不新增 TopicPlannerAgent、DiversityAgent 或 RankingAgent。
- 不覆盖历史草稿或历史 QA 结果，除非用户明确要求重跑并接受覆盖风险。
- 不自动覆盖 `rules/` 或 `prompts/`；Evolver 产物必须先进入 proposal。

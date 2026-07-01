# evolve_prompts 流程说明

本文件只描述短故事工厂 V1 的 prompt 进化流程，不是可执行脚本。V1 禁止自动应用 prompt 或规则改动。

## 触发条件

- `metrics/runs.jsonl` 累积满 10 篇新故事记录后触发。
- 或用户手动触发。

## 流程

1. Evolver Agent 读取最近 N 篇故事的 `qa_v1.json`、`qa_v2.json`、`qa_v3.json`。
2. Evolver Agent 读取 `metrics/runs.jsonl`，统计分数、状态、成本、耗时和 prompt 版本。
3. Evolver Agent 找出长期偏低的评分维度。
4. Evolver Agent 分析可能 root cause，例如开头慢、冲突弱、反转缺伏笔、结尾情绪不足。
5. Evolver Agent 写出 proposal 到 `prompts/_proposals/{YYYYMMDD}-proposal.md`。
6. 系统或人工通知用户审核 proposal。
7. 用户确认后，手动创建新版本 prompt 或修改规则。
8. 新版本命名为 `vN+1.md`，旧版本保留。

## Proposal 内容

Proposal 必须包含：

- 数据范围和样本数量。
- 偏低维度和统计依据。
- 代表性 story_id。
- root cause 分析。
- 建议修改的文件。
- 具体 diff 思路。
- 风险与验证方式。

## 禁止事项

- 禁止自动覆盖 `rules/*.md`。
- 禁止自动覆盖 `prompts/*/vN.md`。
- 禁止自动创建新版本 prompt。
- 禁止只凭单篇故事做系统性结论。
- 禁止为了提高分数而降低 QA 标准。

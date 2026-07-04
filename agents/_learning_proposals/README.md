# Agent Learning Proposals

本目录保存 Story Manager 根据 Top N 策略和人工反馈生成的规则更新建议。

- 这些文件不是正式规则。
- 运行时不得自动覆盖 `agents/*.agent.md`、`rules/` 或 `prompts/`。
- 用户审核后，才可以手动把建议合并到对应 agent 规则或新增 prompt 版本。

这种方式让每个 agent 都能持续成长，同时保留可审查、可回滚的规则变更边界。

# Metrics 说明

V1 使用两种记录形式：

- `metrics/runs.jsonl`：每个 agent 阶段追加一行 JSON。
- `metrics/runs.sqlite`：按照 `metrics/schema.sql` 建表后写入结构化数据。

## runs 表

记录每次 agent 执行的元数据。

字段含义：

- `story_id`：故事 ID，格式为 `{YYYYMMDD}-{slug}`。
- `stage`：阶段，例如 `idea`、`outline`、`writer`、`qa`、`rewrite`。Recorder 只记录其他 agent 阶段，不记录自己的 recorder 阶段。
- `agent_name`：执行阶段对应的 agent 文件名。
- `model`：实际使用的模型名称，未知时填 `NULL`。
- `prompt_path`：使用的 prompt 文件路径。
- `prompt_version`：prompt 版本，例如 `v1`。
- `input_tokens`：输入 token 数。
- `output_tokens`：输出 token 数。
- `duration_seconds`：耗时秒数。
- `cost_usd`：成本，单位 USD。
- `timestamp`：ISO 8601 时间戳。
- `status`：阶段状态，例如 `pass`、`rewrite`、`needs_review`、`needs_human_review`。阶段级记录继续使用 `pass`。
- `artifact_path`：本阶段产物路径。
- `notes`：补充说明。

## stories 表

记录每篇故事的最终结果。

字段含义：

- `story_id`：故事唯一 ID。
- `date`：故事日期，格式 `YYYYMMDD`。
- `slug`：由标题生成的短标识。
- `title`：故事标题。
- `status`：故事最终状态。Story Manager 的 manifest 使用 `passed`、`needs_human_review`、`abandoned` 等状态；旧阶段级 `pass` 仅用于 runs 记录兼容。
- `final_score`：最终 QA 分数。
- `*_prompt_version`：各阶段使用的 prompt 版本。
- `total_cost_usd`：全流程总成本。
- `total_duration_seconds`：全流程总耗时。
- `created_at`、`updated_at`：创建和更新时间。

## prompt_versions 表

登记 prompt 版本。

字段含义：

- `path`：prompt 文件路径，例如 `prompts/style/v1.md`。
- `version`：版本号，例如 `v1`。
- `created_at`：创建时间。
- `change_note`：变更说明。

## 常用查询

查看最近 20 次运行：

```sql
SELECT story_id, stage, model, status, cost_usd, duration_seconds, timestamp
FROM runs
ORDER BY timestamp DESC
LIMIT 20;
```

查看每篇故事总成本和耗时：

```sql
SELECT story_id, status, final_score, total_cost_usd, total_duration_seconds
FROM stories
ORDER BY updated_at DESC;
```

查看 QA 未通过的故事：

```sql
SELECT story_id, final_score, status, updated_at
FROM stories
WHERE status IN ('rewrite', 'needs_review', 'needs_human_review', 'abandoned')
ORDER BY updated_at DESC;
```

查看各 prompt 版本的平均最终分：

```sql
SELECT qa_prompt_version, AVG(final_score) AS avg_score, COUNT(*) AS story_count
FROM stories
WHERE final_score IS NOT NULL
GROUP BY qa_prompt_version
ORDER BY avg_score DESC;
```

## 导出 CSV

使用 SQLite 命令行导出：

```powershell
sqlite3 metrics/runs.sqlite ".headers on" ".mode csv" ".output runs.csv" "SELECT * FROM runs;" ".output stdout"
```

```powershell
sqlite3 metrics/runs.sqlite ".headers on" ".mode csv" ".output stories.csv" "SELECT * FROM stories;" ".output stdout"
```

## 注意事项

- `runs.jsonl` 只能追加，不覆盖。
- 无法获取的 token、成本或模型字段使用 `NULL`，不要伪造。
- 时间戳必须包含时区。


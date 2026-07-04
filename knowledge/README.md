# Knowledge Inputs

`knowledge/` 保存 Story Manager 可选读取的外部知识摘要。目录为空时流程不得中断。

## trends.json

`trends.json` 用来提供热点话题、小说热榜、短剧热榜或人工整理的选题信号。当前系统不会自动抓取第三方平台；如果需要实时热点，可以先由用户或外部授权流程整理为本地 JSON。

示例结构：

```json
{
  "updated_at": "2026-07-02T00:00:00.000Z",
  "signals": [
    {
      "signal_id": "live-commerce-trust",
      "topic": "直播带货信任危机",
      "heat": 84,
      "source": "manual",
      "commercial_angle": "直播间公开审判与身份反转",
      "suitable_genres": ["直播舆论", "都市逆袭", "豪门婚恋"]
    }
  ]
}
```

## feedback_learning.json

`feedback_learning.json` 由 Dashboard 的人工反馈回填更新。它记录高阅读、低流失和高流失题材，用于后续选题排序、Writer 写作技法选择和 QA 评分校准。

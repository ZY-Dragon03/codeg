# 拓展：条件求值（Phase 2+ Backlog）

## 候选能力

| 条件 | 说明 |
|------|------|
| `llm_classify` | 输出语义分类（默认关，有成本） |
| `tool_result_json` | JSON path 匹配 |
| `diff_stats` | 变更行数/文件数阈值 |
| `test_result` | junit/cargo test 摘要解析 |
| `compound` | AND/OR 规则组 |

## 原则

Phase 1 坚持 contains/regex/error_kind；拓展不破坏确定性默认路径。

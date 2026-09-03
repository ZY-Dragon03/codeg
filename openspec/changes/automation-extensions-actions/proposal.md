# 拓展：动作类型（Phase 2+ Backlog）

## 候选能力

| 动作 | 说明 |
|------|------|
| `spawn_terminal` | 唤醒前先跑命令 |
| `auto_merge_task` | 审计通过后 merge（强确认门） |
| `fan_out_delegate` | 并行多 reviewer |
| `register_rule` | Agent 动态登记临时规则（TTL） |
| `notify_user` | 系统/Channel 通知，不唤醒 agent |
| `git_rollback` | 极高风险，需双重确认 |

Phase 1 仅 `spawn_agent` + `send_to_conversation`。

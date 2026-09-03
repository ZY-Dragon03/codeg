# 拓展：额外触发源（Phase 2+ Backlog）

> **不在 Phase 1。** 见 `phase-1-event-automation` STOP 线。

## Why

Phase 1 仅 `turn_failed`、`turn_completed`、`terminal_exited`、`timer_fired`。后续可扩展更多入站事件，统一接入 `LifecycleEvent` 总线。

## 候选触发源（每项未来可拆独立 change）

| 触发 | 说明 |
|------|------|
| `file_changed` | 目录/文件 watch，日志或 artifact 出现 |
| `git_push` / `ci_check_finished` | 仓库 CI 结果 |
| `forge_event` | 与 Forge PR/Issue 统一 |
| `channel_message` | Telegram/Lark 入站 |
| `webhook_received` | 外部 POST |
| `delegation_subtree_completed` | 仅 watch 某委派子树 |
| `mcp_tool_result` | 特定 tool 返回结构 |

## What Changes（未来）

- 各触发源 adapter → 归一 `LifecycleEvent`
- 规则 trigger 枚举扩展
- 权限与鉴权（webhook secret 等）

## Impact

依赖 `event-lifecycle-bus` 稳定后实施。

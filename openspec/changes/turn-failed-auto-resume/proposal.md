# turn_failed 自动 Resume 原会话（RetriableError 续跑）

## Why

阶段一首要痛点：网络/TLS 等可重试错误后，用户需手点 Retry 或打「继续」。应通过规则默认模板自动 `send_to_source_conversation("继续")`。

## What Changes

- 内置规则模板（默认**关闭**，用户一键启用）：
  - `turn_failed` + contains `RetriableError` / `TLS` / `connection reset` 等
  - action: `send_to_conversation` + `source_conversation` + prompt `继续`
  - guard: `max_attempts=3`, `cooldown_ms=5000`
- 条件仅 v1：`contains`、`regex`、`error_kind`（无 LLM）
- UI：规则编辑器 + 内置模板开关，属于 Phase 1B 必需；唯一实现归 event-automation-ui，不能因后端完成而延后
- 依赖：`event-lifecycle-bus` + `action-target-spawn-resume`

## Capabilities

### New Capabilities

- `turn-failed-auto-resume`: 可重试 turn 失败时自动向原会话发送续跑 prompt

### Modified Capabilities

- （无）

## Impact

- 内置模板 seed migration
- Automations 的 Event 页签和 Conversation header 独立按钮共用同一规则编辑器

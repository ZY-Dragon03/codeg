# Agent Wake 登记（进程退出 / 定时唤醒）

## Why

P0-4 / 阶段二：长程序运行期间无人值守。Agent 登记「程序结束或时间到请叫我」→ 本质是 **未来事件 → send_to_source_conversation**，不创建新 Agent 系统。

## What Changes

- **Wake 记录**：`source_conversation_id`, `terminal_id`（可选）, `trigger_kind`, `fire_at` / `process_ref`, `prompt`, `status`
- **触发源**：
  - `terminal_exited` — 复用 `terminal://exit`（`terminal/manager.rs`）
  - `timer_fired` — 持久化定时器，Codeg 重启后仍执行
- **Agent 登记入口**（MCP / 工具）：
  - `wake_on_process_exit({ terminal_id?, prompt })`
  - `wake_after(duration, prompt)`
  - `wake_at(iso_time, prompt)`
- **动作**：统一为 `send_to_conversation` + `source_conversation` + 登记时的 `prompt`
- **WakeBundle**（可选 v1.1）：exit + timeout 互斥取消

## Capabilities

### New Capabilities

- `agent-wake-scheduler`: Agent 登记进程退出或时间到达时唤醒原会话

### Modified Capabilities

- （无）

## Impact

- `lifecycle/wake_scheduler.rs` + DB `agent_wakes`
- `codeg-mcp` 新工具（或扩展现有）
- `event-lifecycle-bus` 发布 `terminal_exited`、`timer_fired`

阶段边界：Phase 1B；Wake 与 event-automation-ui 通过统一 Registry 一起验收。Wake 不阻塞后续 reviewer-controlled-handoff；后者无需 timer/terminal producer。复用同一 action executor，不能由事件观察和 Wake 消费重复发送。

## Product model revision (2026-09-06)

Wake is now an implementation target after the current Event Automation backend, using the existing shared executor rather than a second send system. It formally exposes `wake_after(duration,prompt)`, `wake_at(datetime,prompt)`, `wake_on_process_exit(terminal_id/process identity,prompt)`, `list_wakes` and `cancel_wake`. Records persist source conversation identity, trigger, prompt, status and idempotency; restart restores pending records and each one-shot is consumed once. Registration is authorized by the authenticated current conversation and process identity is stable; “most recently active terminal” is not an acceptable fallback.

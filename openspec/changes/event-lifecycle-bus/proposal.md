# LifecycleEvent 总线与规则引擎基础

## Why

所有事件驱动能力依赖统一事件模型与规则求值入口。无总线则 `turn-failed-auto-resume`、`agent-wake-scheduler` 等会各自 hook connection，不可维护。

## What Changes

- 定义 `LifecycleEvent` 枚举与 payload（session_id、agent_type、error_kind、text_snippet、stop_reason、terminal_id、wake_id…）
- `EventBus` 发布/订阅（进程内，后续可接规则表）
- `EventRule` 最小 schema：trigger、condition、action、guard、priority、enabled、scope
- 规则求值器：匹配 trigger + condition，返回待执行 action（不执行——执行在 action-target change）
- 阶段一仅接入：`turn_failed`（含 error_kind + 原始文本）

## Capabilities

### New Capabilities

- `event-lifecycle-bus`: 智能体生命周期事件发布与规则匹配基础

### Modified Capabilities

- （无）

## Product model revision (2026-09-06)

Phase 1 consumes the settled ACP lifecycle rather than treating a failure
notification as the only event. The canonical envelope MUST include an
`event_id`, `conversation_id`, `folder_id`, `agent_type`, stable `turn_id`,
trigger, stop reason, assistant output snapshot, merged error title/details,
and source connection/session metadata. A session id is runtime metadata and
MUST NOT identify more than one turn.

`ContentDelta` may set a pending content match while streaming, but it MUST
NOT dispatch an action. `TurnComplete(stop_reason=end_turn)` is the only
normal completion trigger and settles the pending report state. Failure
signals are emitted after settle and merge `SessionFailure` with
`AcpEvent::Error` in either arrival order. Cancellation, refusal, and other
failure stop reasons MUST NOT be treated as normal completion.

The lifecycle change owns envelope identity, settle ordering, merge and
deduplication. Target resolution, send receipts and structured execution logs
are consumed from `action-target-spawn-resume` and the UI change; the shared
engine may orchestrate them but this change does not create a second send
system.

## Impact

- 实际实现位于 `src-tauri/src/event_rules/`，复用 ACP InternalEventBus
- `acp/connection.rs`、`work_task/engine.rs` 发布点
- DB：已存在 `event_rule`、`event_rule_attempt`、`event_rule_log`

本 change 的 1A 完成不等于 Phase 1 产品完成；event-automation-ui 负责 1B scope/校验/预览/日志接口和双入口。Phase 3 成功 turn producer 由 event-automation-spawn-agent 的 1.4 任务交付，可独立先于 spawn；reviewer-controlled-handoff 消费该事件，不另建 producer。

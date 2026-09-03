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

## Impact

- `src-tauri/src/lifecycle/` 或 `orchestration/`
- `acp/connection.rs`、`work_task/engine.rs` 发布点
- DB：`event_rules` 表（或等价）

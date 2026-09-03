## Context

见 `proposal.md` 与 `phase-1-event-automation`。

## Goals / Non-Goals

**Goals:** 双动作执行器、conversation_ref 解析、与 AutomationConfig 对齐。

**Non-Goals:** 阶段一不实现 `spawn_agent`（阶段三）；不实现 `spawned_agent_conversation`（阶段三链式）。

## Decisions

- **Initial Prompt 仅存在于 spawn_agent**：`prompt_blocks` 即启动任务，非全局人格
- **send 路径**：Resume = 已有 `connection_id` 上 `session/prompt`，不新建会话行除非已关闭
- **source_conversation**：从 `LifecycleEvent.session_id` / `conversation_id` 解析

## Risks

- [会话已关闭] → 动作失败并记日志；可选 fallback spawn（阶段三外不做）

## Migration Plan

阶段一：`send_to_conversation` only → 阶段三：加 `spawn_agent`

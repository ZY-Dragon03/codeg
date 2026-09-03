## Context

见 `proposal.md`。`delegation_completed` 等已在 engine 内消费，需升格为可订阅事件。

## Goals / Non-Goals

**Goals:** Event 类型、Rule 存储、match-only 引擎、阶段一 `turn_failed` 发布。

**Non-Goals:** 阶段一不发布 `timer_fired`（属 wake-scheduler）；不执行 action。

## Decisions

- **Event 与 Automation 分离**：Rule 表独立，避免 `TriggerKind` 膨胀
- **Condition v1**：`none`、`contains[]`、`regex`、`error_kind` — 无 LLM
- **匹配策略**：同事件多规则按 `priority` 降序，`first_match` 默认（可配置 `run_all` 后续）

## Risks

- [发布点遗漏] → 阶段一只要求 `turn_failed`，文档列出后续接入清单

## Migration Plan

1. 只发布事件 + debug 日志
2. 接规则表 + match API
3. 接 action 执行器（action-target change）

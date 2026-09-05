## Context

见 `proposal.md`。`delegation_completed` 等已在 engine 内消费，需升格为可订阅事件。

## Goals / Non-Goals

**Goals:** Event 类型、Rule 存储、match-only 引擎、阶段一 settled failure,
content-match and normal-completion publication.

**Non-Goals:** timer/process wake persistence belongs to wake-scheduler; this
change does not define a second action executor. It publishes the event and
returns a match; action-target owns target resolution/send receipts.

## Decisions

- **Event 与 Automation 分离**：Rule 表独立，避免 `TriggerKind` 膨胀
- **Condition v1**：`none`、`contains[]`、`regex`、`error_kind` — 无 LLM
- **匹配策略**：同事件多规则按 `priority` 降序，`first_match` 默认（可配置 `run_all` 后续）
- Phase 1B 补同 priority 的 id 升序稳定排序、scope 过滤；first-match 被 guard 阻挡不落到下一条，预览必须解释。具体差额唯一归 event-automation-ui。

## Risks

- [发布点遗漏] → 阶段一只要求 `turn_failed`，文档列出后续接入清单

## Migration Plan

1. 只发布事件 + debug 日志
2. 接规则表 + match API
3. 接 action 执行器（action-target change）

## 当前实现和后续归属

9d685f36 实际由 event_rules/engine.rs 订阅 InternalEventBus，缓存 SessionFailure/Error 并在 TurnComplete settle 后产生 turn_failed。当前成功 end_turn 只重置 attempts，没有 turn_completed 规则能力。1A 已勾选任务仅作历史交付记录，不表示本轮实机验证。

Phase 3 由 event-automation-spawn-agent 1.4 扩展 settled-success producer 与唯一 turn correlation，供 reviewer core 和 spawn 共用；不能把 session id 当 turn 唯一 id。Wake 的 terminal/timer producer 独立。chain 完成事件由其关联 handler 消费，不能再次被普通起始规则启动新链。

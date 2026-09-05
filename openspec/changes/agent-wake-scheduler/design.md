## Context

见 `phase-1-event-automation` P0-4 与阶段二。

## Goals / Non-Goals

**Goals:** Wake CRUD、timer 持久化、terminal exit 匹配、MCP 登记。

**Non-Goals:** 阶段二不做 WakeBundle；不做 wake 另一 agent（仅 source_conversation）。

## Decisions

- **归属**：Wake 绑定创建它的 `conversation_id` + `connection_id`（若仍存活）
- **terminal 匹配**：优先 `terminal_id`；无 id 时按会话最近活跃终端（易错，文档警告）
- **timer**：服务端 `tokio` + DB 持久化 next_fire；启动时 reload pending
- **执行**：Wake 触发生成确定的 wake action，走共享 send_to_conversation 执行器及日志/目标验证；不创建第二套 Event Rule。发布 lifecycle 供观察时不得再从同一 Wake 重复派发。

## Risks

- [终端 id 复用] → Wake 一次性消费后标记 `consumed`
- [会话已关闭] → 记失败；可选通知用户

## Migration Plan

阶段二在 turn-failed 之后；发布 `terminal_exited` / `timer_fired` 事件

先完成 Phase 1B 用户可配置产品再按价值交付 Wake。Wake 是 terminal/timer producer 的依赖，**不是 reviewer-controlled-handoff 的硬依赖**；reviewer 只需 settled-success producer、稳定目标和决策/chain 状态。Wake 绑定的持久化身份以 conversation_id 为准，connection_id 仅运行时句柄。

### Durable wake contract (2026-09-06)

Registration requires an authenticated companion bound to the source conversation; callers cannot self-report another source id. Process-exit wakes require a stable terminal/process identity and are rejected when only a “recent terminal” guess is available. Timer rows transition with a compare and set operation from pending to dispatching to sent/failed, carry a wake id in logs, and are recovered on restart when due. The scheduler consumes one-shot rows exactly once and publishes an observation event without re-dispatching the same wake. Missing/deleted/offline/busy targets are visible failures and never spawn or change target.

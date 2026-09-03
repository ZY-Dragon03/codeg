## Context

见 `phase-1-event-automation` P0-4 与阶段二。

## Goals / Non-Goals

**Goals:** Wake CRUD、timer 持久化、terminal exit 匹配、MCP 登记。

**Non-Goals:** 阶段二不做 WakeBundle；不做 wake 另一 agent（仅 source_conversation）。

## Decisions

- **归属**：Wake 绑定创建它的 `conversation_id` + `connection_id`（若仍存活）
- **terminal 匹配**：优先 `terminal_id`；无 id 时按会话最近活跃终端（易错，文档警告）
- **timer**：服务端 `tokio` + DB 持久化 next_fire；启动时 reload pending
- **执行**：Wake 触发 → 构造 LifecycleEvent → 可 bypass 规则直接执行 send，或生成隐式规则（倾向直接 send 减复杂度）

## Risks

- [终端 id 复用] → Wake 一次性消费后标记 `consumed`
- [会话已关闭] → 记失败；可选通知用户

## Migration Plan

阶段二在 turn-failed 之后；发布 `terminal_exited` / `timer_fired` 事件

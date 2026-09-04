## Context

见 `phase-1-event-automation` 阶段一验收。

## Goals / Non-Goals

**Goals:** 模板规则、护栏、可配置关键词列表。

**Non-Goals:** 不自动切换 HTTP/1.1（属 `cursor-network-transport-setting`）；不 spawn 新 agent。

## Decisions

- **每会话每规则独立计数** max_attempts
- **cooldown** 同规则同会话窗口内忽略重复事件
- **超限后**：记 timeline 事件，不静默失败

## 默认模板关键词（可编辑）

`RetriableError`, `TLS`, `connection reset`, `temporarily unavailable`, `Client network socket disconnected`

## Phase 1B 契约

模板是 event_rule 的可编辑数据，默认关闭；编辑/启停热加载，重启不覆盖用户修改。keywords 默认 ANY，可选 ALL；contains、regex、error_kind 是互斥 condition type。prompt 是纯文本 follow-up，不是 Initial Prompt。

UI 的唯一交付归 event-automation-ui（Automations Event tab / Conversation 独立按钮），本 change 的验收必须包含它，不允许 deferred。scope 在服务端限制事件来源，不能以 target 冒充。

现 reserve_attempt 先于 send，发送失败也可能消耗一次尝试；成功 end_turn 或距上次自动续跑30分钟重置连续失败计数。reviewer iteration/depth 不复用此 reset，链内重试继承 reviewer-controlled-handoff 的 chain guards。

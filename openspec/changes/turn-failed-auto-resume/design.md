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

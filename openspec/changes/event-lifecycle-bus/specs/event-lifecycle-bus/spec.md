## Purpose

为事件驱动自动化提供统一的生命周期事件发布与规则匹配基础，避免各功能在 ACP 连接层重复 hook。

## ADDED Requirements

### Requirement: 系统必须发布 turn_failed 生命周期事件

当 ACP 会话一轮失败时，系统 MUST 发布包含会话标识、错误分类与原始错误文本的 LifecycleEvent。

#### Scenario: 连接类失败

- **WHEN** turn 失败且 workspace 错误条分类为 connection
- **THEN** 事件 MUST 含 `event=turn_failed` 与 `error_kind=connection`

### Requirement: 规则必须可按 trigger 与 condition 匹配

系统 MUST 持久化事件规则，并在收到 LifecycleEvent 时求值 trigger 与 condition。

#### Scenario: 无 condition 规则

- **WHEN** 规则 trigger 为 `turn_failed` 且 condition 为 `none`
- **THEN** 该规则 MUST 在每次 turn_failed 时匹配

#### Scenario: contains 条件

- **WHEN** 规则 condition 要求文本同时包含 `RetriableError` 与 `TLS`
- **AND** 事件文本满足
- **THEN** 规则 MUST 匹配

### Requirement: 规则匹配结果必须可观测

系统 MUST 记录规则命中或未命中（至少 debug 日志，阶段一可不含 UI）。

#### Scenario: 命中记录

- **WHEN** 某规则匹配 turn_failed 事件
- **THEN** 系统 MUST 记录规则 id 与事件 id 的关联

## Purpose

在实验 Agent 完成一轮工作后自动启动审计 Agent，并在审计完成后向原实验会话发送 follow-up，形成可配置的无人值守实验闭环。

## ADDED Requirements

### Requirement: 实验 turn_completed 必须能 spawn 审计 agent

系统 MUST 支持实验会话 `turn_completed` 时自动 spawn 配置的审计 agent 及 Initial Prompt。

#### Scenario: E70 实验完成

- **WHEN** 实验会话 turn_completed
- **AND** 启用实验→review 规则
- **THEN** 系统 MUST spawn 配置的 review agent 并附带 Initial Prompt 审计清单

### Requirement: 审计完成后必须能 resume 实验会话

审计会话完成后，系统 MUST 向关联的实验会话发送 follow-up prompt。

#### Scenario: Review 完成交棒

- **WHEN** review 会话 turn_completed
- **AND** 存在关联的 experiment_conversation_id
- **THEN** 系统 MUST 向实验会话发送 follow-up prompt
- **THEN** 系统 MUST NOT 使用 Initial Prompt

### Requirement: 闭环必须受 max_chain_depth 限制

实验与审计之间的自动交棒 MUST 受可配置链深度上限约束。

#### Scenario: 防止无限循环

- **WHEN** 实验↔review 链已达配置深度上限
- **THEN** 系统 MUST NOT 再自动 spawn 或 send
- **THEN** 系统 MUST 记录停止原因

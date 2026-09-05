## Purpose

定义事件自动化仅有的两种动作目标：新建 Agent 会话（带 Composer 快照）或向已有会话发送 follow-up 消息。

## ADDED Requirements

### Requirement: send_to_conversation 必须向解析后的会话发送 prompt

系统 MUST 支持 `send_to_conversation` 动作，包含 `conversation_ref` 与 `prompt`。

#### Scenario: 向 source_conversation 发送

- **WHEN** 动作 `conversation_ref=source_conversation` 且 prompt 为「继续」
- **AND** 事件来自会话 C
- **THEN** 系统 MUST 向会话 C 发送该 prompt

### Requirement: spawn_agent 必须复用 AutomationConfig 启动新会话

系统 MUST 支持 `spawn_agent` 动作，其负载 MUST 与 `AutomationConfig` 字段兼容。

#### Scenario: 带 Initial Prompt 启动 review agent

- **WHEN** 动作指定 `agent_type=cg-review` 且 `prompt_blocks` 含审计任务文本
- **THEN** 系统 MUST 创建新会话并以该快照启动 agent
- **THEN** 系统 MUST NOT 要求全局 agent 人格配置

### Requirement: conversation_ref 必须支持便利别名

系统 MUST 解析 `source_conversation`、`parent_conversation`、`specific_conversation`。

系统 MUST 支持由特定 chain spawn receipt 绑定的 `spawned_agent_conversation`；existing target MUST 使用持久化 conversation 身份，不能以 Agent 类型或临时连接 id 代替。

#### Scenario: parent_conversation

- **WHEN** 事件来自委派子会话且 ref 为 `parent_conversation`
- **THEN** 系统 MUST 向委派父会话发送 prompt

#### Scenario: 指向既有跨 folder 会话

- **WHEN** specific target 为另一个 folder 的现有 B
- **THEN** 系统 MUST 使用 B 的身份和 folder 发送 follow-up，MUST NOT 使用源 folder 或重发 Initial Prompt

#### Scenario: 目标不存在或不可恢复

- **WHEN** 目标已删除或不能按原身份恢复
- **THEN** 系统 MUST 可见失败并保留原 target，MUST NOT fallback spawn

#### Scenario: spawn receipt 精确绑定

- **WHEN** 使用 spawned_agent_conversation
- **THEN** 系统 MUST 解析指定 chain action 的新会话 receipt，MUST NOT 选择最近打开的 agent

### Requirement: Phase 1 MUST resolve existing targets by identity and availability

For source or explicit existing targets, the executor MUST re-read the conversation row and choose a Connected, idle connection whose conversation, folder and agent identity match. A DB row existing MUST NOT be reported as runtime available. Busy, offline and deleted targets MUST return structured per-target errors and MUST NOT fall back to spawn or another HashMap entry.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Multi-target actions MUST have independent receipts

One action MAY contain multiple existing targets. Each target MUST have its own intent, dispatch receipt, error and idempotency key `(turn_id, rule_id, target_id)`, so a partial success cannot be hidden by another target.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: MCP send/read access MUST be authorized

`send_to_conversation(conversation_id,prompt)` and read-context operations MUST accept only targets in the authenticated automation/current-context policy. Unauthorized, deleted, busy and offline targets MUST be structured errors; the tools MUST NOT spawn sessions.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Phase 1 capability boundary MUST be explicit

`send_to_conversation` with source/specific existing references is Phase 1. `spawn_agent`, `parent_conversation` and `spawned_agent_conversation` remain Phase 3 and MUST be rejected as unavailable rather than silently emulated.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

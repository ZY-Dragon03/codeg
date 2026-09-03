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

#### Scenario: parent_conversation

- **WHEN** 事件来自委派子会话且 ref 为 `parent_conversation`
- **THEN** 系统 MUST 向委派父会话发送 prompt

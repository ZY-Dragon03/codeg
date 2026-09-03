## Purpose

让生命周期事件能够用与定时 Automation 相同的 Composer 快照启动新的 Agent 会话，其中 prompt_blocks 仅表示该次启动任务而非全局人格。

## ADDED Requirements

### Requirement: turn_completed 规则必须能 spawn 指定 agent

系统 MUST 允许配置 `turn_completed` 触发器，并以 `spawn_agent` 动作启动指定 agent 类型及 Initial Prompt。

#### Scenario: 实验完成后启动 reviewer

- **WHEN** 规则 trigger 为 `turn_completed` 且 action 为 `spawn_agent`
- **AND** `agent_type` 为 `cg-review`，`prompt_blocks` 含审计清单
- **THEN** 系统 MUST 创建新会话并以该快照启动
- **THEN** 新会话 MUST NOT 继承实验会话的聊天历史

### Requirement: spawn 配置必须与 AutomationConfig 兼容

系统 MUST 使 `spawn_agent` 动作负载与现有 `AutomationConfig` 字段完全兼容。

#### Scenario: 字段对齐

- **WHEN** 规则保存 spawn 动作
- **THEN** 系统 MUST 接受 `prompt_blocks`、`mode_id`、`config_values`、`label_snapshot`
- **THEN** 系统 MUST 使用与 Automation fire 相同的启动语义

### Requirement: 用户必须能从现有 Automation 导入快照

系统 MUST 支持将已有 Automation 的 config 复制到事件规则。

#### Scenario: 导入

- **WHEN** 用户从 Automation A 导入到事件规则
- **THEN** 规则 MUST 获得 A 的 config 副本

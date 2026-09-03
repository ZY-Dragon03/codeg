# Action Target：Spawn Agent 与 Resume Conversation

## Why

事件后继只有两种本质：**新建会话（需要 Initial Prompt / Composer 快照）** 或 **向已有会话发 follow-up（不需要 Initial Prompt）**。这是 P0-2 核心抽象，所有规则动作都落在这两种 target 上。

## What Changes

- 动作类型：`spawn_agent` | `send_to_conversation`
- **spawn_agent**：复用 `AutomationConfig`（`agent_type`, `prompt_blocks`, `mode_id`, `config_values`, `label_snapshot`）
- **send_to_conversation**：`conversation_ref` + `prompt`（仅 follow-up 文本）
- **conversation_ref 解析器**：
  - `source_conversation` — 触发事件会话
  - `parent_conversation` — 委派父会话
  - `specific_conversation` — 显式 `conversation_id`
  - `spawned_agent_conversation` — 同规则链上前一步 spawn 的会话（阶段三）
- 执行器：匹配规则后调用现有「启动 automation 会话」与「向会话 send_message」路径
- 护栏：`max_chain_depth` 在动作链上递增

## Capabilities

### New Capabilities

- `action-target-spawn-resume`: 事件规则的动作目标解析与执行（Spawn vs Resume）

### Modified Capabilities

- （无）

## Impact

- `lifecycle/action_executor.rs`
- 复用 `commands/automation.rs` fire 路径、`acp` prompt 路径
- 阶段一仅需 `send_to_conversation` + `source_conversation`

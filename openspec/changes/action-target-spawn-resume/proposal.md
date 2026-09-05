# Action Target：Spawn Agent 与 Resume Conversation

## Why

事件后继只有两种本质：**新建会话（需要 Initial Prompt / Composer 快照）** 或 **向已有会话发 follow-up（不需要 Initial Prompt）**。这是 P0-2 核心抽象，所有规则动作都落在这两种 target 上。

## What Changes

- 动作类型：`spawn_agent` | `send_to_conversation`
- **spawn_agent**：launch envelope 承载 agent_type/folder/isolation，内含兼容 AutomationConfig 的 prompt_blocks/display_text/mode_id/config_values/label_snapshot；不把 agent_type 误当 config 内字段
- **send_to_conversation**：`conversation_ref` + `prompt`（仅 follow-up 文本）
- **conversation_ref 解析器**：
  - `source_conversation` — 触发事件会话
  - `parent_conversation` — 委派父会话
  - `specific_conversation` — 显式 `conversation_id`
  - `spawned_agent_conversation` — 同规则链上前一步 spawn 的会话（阶段三）
- 执行器：匹配规则后调用现有「启动 automation 会话」与「向会话 send_message」路径
- 护栏：执行器消费 reviewer-controlled-handoff 授权的 chain action；max_iterations/max_chain_depth 的持久化计数唯一归该 change

## Capabilities

### New Capabilities

- `action-target-spawn-resume`: 事件规则的动作目标解析与执行（Spawn vs Resume）

### Modified Capabilities

- （无）

## Impact

- 实际落点为 `src-tauri/src/event_rules/engine.rs` 的目标解析/send 路径
- 复用 `commands/automation.rs` fire 路径、`acp` prompt 路径
- 阶段一仅需 `send_to_conversation` + `source_conversation`

Phase 1B 在公开 source/specific selector 前必须验证目标 DB 身份/folder/deleted/busy/offline。Existing 不允许失败后自动 spawn；Phase 3 加 parent/spawned alias 及保持身份的 reconnect。动态 reviewer target 复用这些引用，不以 Agent 类型代替已有 conversation。

## Product model revision (2026-09-06)

Phase 1 actions are existing-conversation sends. A rule may fan out to the source and multiple explicit existing conversation ids. The shared executor resolves each target independently, records intent/receipt/error independently, and deduplicates by turn + rule + target. A database row existing is not runtime availability: dispatch must choose a Connected, idle, identity-matching connection and must not use the first HashMap entry or fall back to spawn.

The same resolver/executor is used by Event Automations, MCP send tools and Wake. MCP `send_to_conversation` and read-context calls are authorized only for the current automation/context allowed target set and return structured busy/offline/deleted errors. Spawn, parent and spawned aliases remain Phase 3 capabilities and are not prerequisites for the current product.

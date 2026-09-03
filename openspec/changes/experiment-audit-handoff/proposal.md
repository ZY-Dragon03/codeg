# 实验审计闭环（完成 → Review → Resume 实验 Agent）

## Why

P1 / 阶段三核心：实验 Agent `turn_completed` → Spawn `cg-review` + Initial Prompt（审计清单）→ reviewer 完成后 → Resume **原实验 Agent** + follow-up（非 Initial Prompt）。形成无人值守实验闭环。

## What Changes

- 规则对 1：`turn_completed`（实验会话，可 scoped by agent_type 或 tag）→ `spawn_agent`（cg-review + 审计 prompt 模板）
- 规则对 2：`turn_completed`（reviewer 会话）→ `send_to_conversation` + `parent_conversation` 或规则元数据记录的 `experiment_conversation_ref`
- **链元数据**：spawn 时记录 `parent_experiment_conversation_id` 供 review 完成时解析
- `max_chain_depth` 防止 实验↔review 无限循环
- 内置模板：五问审计清单（设计、泄漏、指标、追加实验、下一批任务）

## Capabilities

### New Capabilities

- `experiment-audit-handoff`: 实验完成自动审计与审计后恢复实验 Agent 的闭环规则

### Modified Capabilities

- （无）

## Impact

- 依赖 `event-automation-spawn-agent`、`action-target-spawn-resume`
- 可选依赖 `delegation-target-policy`（spawn review agent 时校验）

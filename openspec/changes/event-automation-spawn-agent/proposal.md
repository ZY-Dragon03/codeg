# 事件触发 Spawn Agent + Initial Prompt（复用 AutomationConfig）

## Why

P0-1 / 阶段三：事件发生时**新建**指定 Agent 会话，Initial Prompt 即启动任务，直接复用 Automations 的 Composer 快照，不另发明 Prompt Profile。

> 原 Automation = 到时间启动快照  
> Event Automation = **事件发生时**启动同一份快照

## What Changes

- 规则 action `spawn_agent` 负载 = `AutomationConfig` 全集
- 触发器阶段三重点：`turn_completed`、`delegation_completed`（可选）
- 与现有 automation fire 路径共用：worktree、isolation、agent_type、config_values
- UI：规则编辑器内嵌「迷你 Composer」/ 从现有 Automation 导入快照
- Event 规则命名：**Event Automation**（产品层称呼，实现可仍叫 event_rules）

## Capabilities

### New Capabilities

- `event-automation-spawn-agent`: 生命周期事件触发时以 AutomationConfig 快照启动新 Agent 会话

### Modified Capabilities

- （无）

## Impact

- `action-target-spawn-resume` 的 spawn 分支
- `commands/automation.rs` 抽取可共用 `fire_composer_snapshot(...)`

# 智能体响应事件驱动自动化（规则链 / 后继编排）

> **状态：已由 Phase 1 拆分取代。** 见 `phase-1-event-automation` 及子 change：
> `event-lifecycle-bus`、`event-automation-spawn-agent`、`action-target-spawn-resume`、
> `turn-failed-auto-resume`、`agent-wake-scheduler`、`experiment-audit-handoff`。
> 拓展 backlog 见 `automation-extensions-*`。本文档保留作历史背景。

## Why

Codeg 已有 **Automations**（cron / 手动触发，重放 composer 快照）和 **To-dos**（人工评审后 Rework / Double-check），但缺少对**运行中智能体输出**的自动化反应：

- 可重试错误（如 `RetriableError: … TLS connection …`）仍需人工点 Retry 或手打「继续」
- 正常结束时无法自动调用**指定审计智能体**做复核、汇总或二次派发
- 无「固定匹配 + 可选 agent 分析」的通用规则层，各场景只能写死或靠主 agent 自己 delegate

用户需要可配置的**事件驱动编排**：在 turn 结束、委派完成、任务失败等事件上，按规则匹配输出/错误类型，执行确定性动作（续跑、委派审计、派发新任务），而非每次靠人盯屏。

## What Changes

- 引入 **Agent Lifecycle Rules**（名称可调整）：声明式规则引擎，订阅平台事件（`turn_failed`、`turn_completed`、`delegation_completed`、`task_review_ready` 等）。
- 每条规则包含：
  - **触发器**（事件类型 + 作用域：全局 / 文件夹 / agent 类型 / 单会话）
  - **条件**（结构化错误 kind、正则/子串匹配、stop_reason、可选 LLM 分类器——默认可关）
  - **动作**（`send_message`、`retry_turn`、`delegate_to_agent`、`enqueue_task`、`chain_automation` 等）
- 内置规则模板：TLS/网络可重试错误 → 自动发送「继续」；成功结束 → 调用指定 reviewer agent 审计。
- 规则执行有**护栏**：最大链深度、冷却时间、每规则预算、人工确认门（高风险动作可要求 approve）。
- 与现有 Automations / Task engine / delegation 集成，复用 `delegate_to_agent` 与 worktree，不另起一套运行时。
- 可观测：规则命中、动作结果、跳过原因写入 run log / 任务时间线。

## Capabilities

### New Capabilities

- `agent-lifecycle-rules`: 基于智能体生命周期事件的条件规则与后继动作编排

### Modified Capabilities

- （无 — 与 `delegation-target-policy` 正交，实现时需调用其策略校验）

## Impact

- 新模块：`src-tauri/src/lifecycle_rules/`（或 `orchestration/`）+ 设置 UI
- `work_task/engine.rs`、`acp/connection.rs` 事件总线接入点
- `codeg-mcp` 委派路径（动作 `delegate_to_agent`）
- 与 `delegation-target-policy`、`custom-agent-settings-parity` 依赖：审计 agent 需可配置权限与可被委派

## 现状调研（无人完整实现）

| 能力 | Codeg 现状 | 其他 |
|------|------------|------|
| 定时/手动跑 prompt | ✅ Automations (`schedule` \| `manual`) | — |
| 错误条 + 人工 Retry | ✅ Workspace error strip | agent 内部 amber 自恢复 |
| 任务评审后人工 follow-up | ✅ To-do review intents | — |
| 输出/错误 **模式匹配** → 自动续跑 | ❌ | 未见 Codeg fork |
| 正常结束 → **自动指定 agent 审计/复核** | ❌ | pi-orchestrator 多阶段但非输出驱动 |
| Forge PR 触发 | ✅ 仓库事件 → 任务 | 非 agent 输出规则 |

结论：**品类内无人做成通用规则引擎**；需在 Codeg 层新建，而非等上游补丁。

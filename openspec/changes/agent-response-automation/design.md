> SUPERSEDED / 历史背景，非实施 authority（2026-09-05）。请使用 phase-1-event-automation 路线图及 event-automation-ui / reviewer-controlled-handoff / 其子 change。下列旧术语、任务和规范仅保留历史，不派工、不勾成已实现，也不把 lifecycle_rules 等模型作为第二套规则系统。

## Context

见 `proposal.md`。现有能力边界：

- `AutomationTriggerKind` 仅 `schedule | manual`（`src/lib/types.ts`）
- Task engine 状态机 `todo → … → review`，follow-up 需人工触发（`work_task/engine.rs`）
- 错误 UI 分类展示（connection / access / limit…）但未接规则引擎
- `delegation_completed` 等事件已在 engine 内消费，未暴露给用户配置

## Goals / Non-Goals

**Goals:**

- 统一 **LifecycleEvent** 总线：turn、delegation、task、automation run 归一发布
- **RuleSet** 持久化（DB + 设置 UI）：优先级、启用开关、作用域
- **条件求值器**：先 cheap 匹配（`error_kind`、`contains`、`regex`），可选 `llm_classify`（用户显式开启）
- **动作执行器**：幂等、可审计、受 `delegation-target-policy` 约束
- 首版模板：网络可重试 → `send_message("继续")`；`turn_completed` + success → `delegate_to_agent(reviewer)`

**Non-Goals:**

- 不做通用 n8n 式任意 HTTP 节点（聚焦 agent 生命周期）
- 不替代主 agent 的 plan/delegate 推理（规则是确定性护栏与流水线）
- 不在 v1 实现跨机器规则同步

## Decisions

### 1. 事件源

**决定**：在 `work_task/engine.rs` 的 `on_turn_complete`、`on_event(delegation_completed)`、ACP 连接 `TurnFailed` / `ErrorStrip` 分类点发布 `LifecycleEvent`。Automations 的 run settle 同样发布 `automation_run_finished`。

**备选**：仅轮询 transcript — 拒绝，延迟高且漏中间态。

### 2. 条件模型

**决定**：JSON Rule 结构：

```json
{
  "when": { "event": "turn_failed", "error_kind": "connection", "text_matches": ["RetriableError", "TLS"] },
  "then": { "action": "send_message", "text": "继续", "cooldown_ms": 30000, "max_attempts": 3 }
}
```

`text_matches` 支持 `any`/`all`；`error_kind` 复用现有 workspace 分类。

**备选**：纯 LLM 判断 — 仅作可选 `llm_classify` 步骤，默认关闭（成本与不确定性）。

### 3. 成功后续：审计链

**决定**：`turn_completed` + `stop_reason=end_turn` + 可选 `diff_non_empty` 条件 → `delegate_to_agent`，目标从规则或文件夹默认 `reviewer_agent_id` 读取；prompt 模板可配置（「审计以下变更…」+ 自动附 summary/diff 引用）。

与 To-do review 关系：规则可 `enqueue_task` 进入 review，或直接 headless delegate reviewer，由规则 `action` 选择。

### 4. 护栏

**决定**：

- 全局 `max_rule_chain_depth`（默认 3，与委派深度独立计数）
- 每规则 `max_attempts` + `cooldown_ms`
- `require_human_approve` 动作级开关（如自动 merge、自动派发 full-access agent）
- 规则 miss 时**无操作**（fail open on configuration absence）

### 5. 与 Automations 关系

**决定**：Automations 保持「定时/手动发射」；Lifecycle Rules 是**反应式**第二层。规则动作可 `chain_automation(id)` 触发已有 automation，但不合并数据模型。

## Risks / Trade-offs

- [规则打架] → 显式 priority；同事件多命中时按 priority 执行第一条或 configurable `first_match` / `run_all`
- [无限「继续」循环] → max_attempts + 升级人工（写 task 事件）
- [审计 agent 权限不足] → 依赖 `custom-agent-settings-parity` + `delegation-target-policy`
- [误匹配] → 规则测试台（喂 sample 输出预览命中）

## Migration Plan

1. 只读事件发布 + 日志
2. 内置模板规则（默认关闭）
3. UI 编辑 + 测试台
4. 与 task review 可选联动

## Open Questions

- `llm_classify` 用 lead agent 还是专用 cheap model？v1 可不做。
- 规则是否支持 channel（Telegram）入站事件？后续扩展。

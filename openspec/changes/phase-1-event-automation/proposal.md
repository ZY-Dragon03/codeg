# Phase 1：事件驱动自动化（实验 Agent 续命 / 等待 / 交棒 / 审计）

## Why

Codeg 现有 **Automations** 是「到时间启动一份 Composer 快照」。缺的是：**事件发生时**对已有或新建会话做确定性后继——网络断了自动「继续」、长程序跑完叫醒、实验完成启动 reviewer、审计完叫醒原实验 Agent。

V1 不是超级自动化平台，而是让**实验 Agent 能自己续命、等待、交棒、被审计、再继续**。

## 产品心智（三句话）

| 场景 | 行为 |
|------|------|
| **异常了** | 匹配错误 → 给**原 Agent** 发「继续」 |
| **程序还在跑** | 登记 Wake → 程序结束/时间到 → **唤醒原 Agent** |
| **真的做完了** | 完成 → **Spawn 指定 Agent + Initial Prompt** → 审计/纠正 → 必要时再 Resume 原 Agent |

## 核心纠正

**Initial Prompt 不是 Agent 全局人格**，而是 **Spawn Agent 时使用的启动任务 Prompt**，直接复用现有 `AutomationConfig`：

`prompt_blocks` + `mode_id` + `config_values` + `label_snapshot`

> 原 Automation = 到时间启动 Composer 快照  
> 高级 Automation = **事件发生时**启动同一份快照

## V1 能力矩阵（P0 + P1）

| ID | 能力 | OpenSpec change | 阶段 |
|----|------|-----------------|------|
| P0-1 | 事件 → Spawn 指定 Agent + Initial Prompt | `event-automation-spawn-agent` | 三 |
| P0-2 | Action Target：Spawn vs Resume Conversation | `action-target-spawn-resume` | 一～三 |
| P0-3 | turn_failed → Resume 原会话（RetriableError 等） | `turn-failed-auto-resume` | **一** |
| P0-4 | Agent 登记 wake_on_exit / wake_after / wake_at | `agent-wake-scheduler` | 二 |
| P1 | turn_completed → Spawn reviewer → Resume 实验 Agent | `experiment-audit-handoff` | 三 |
| 基础 | LifecycleEvent 总线 + Rule 引擎壳 | `event-lifecycle-bus` | **一** |

## 规则最小模型

```text
Rule
├─ Trigger: turn_failed | turn_completed | terminal_exited | timer_fired | delegation_completed
├─ Condition: none | contains | regex | error_kind
├─ Action: spawn_agent | send_to_conversation
└─ Guard: max_attempts | cooldown | max_chain_depth
```

### spawn_agent（复用 AutomationConfig）

`agent_type`, `prompt_blocks`, `mode_id`, `config_values`, `label_snapshot`

### send_to_conversation

`conversation_ref` + `prompt`（无 Initial Prompt——会话已有上下文）

**conversation_ref 便利别名：**

- `source_conversation` — 触发事件的会话
- `parent_conversation` — 委派父会话
- `specific_conversation` — 显式 id
- `spawned_agent_conversation` — 本规则刚 spawn 的子会话（链式用）

## 开发顺序

### 阶段一（每天痛点）

1. `event-lifecycle-bus` — 发布 `turn_failed` 等事件
2. `action-target-spawn-resume` — `send_to_conversation` + `source_conversation`
3. `turn-failed-auto-resume` — contains/regex/error_kind + 「继续」+ max_attempts=3, cooldown=5s

### 阶段二（长时间实验）

4. `agent-wake-scheduler` — `terminal_exited`, `timer_fired`, MCP 登记 wake
5. `send_to_source_conversation` 与 Wake 联动

### 阶段三（审计闭环）

6. `event-automation-spawn-agent` — `turn_completed` → Spawn cg-review + Initial Prompt
7. `experiment-audit-handoff` — reviewer 完成 → Resume 原实验 Agent

**阶段三做完即停。** 不做 Webhook、CI、LLM classifier、自动 merge、fan-out。

## 依赖（非 Phase 1，但影响体验）

- `session-config-replay-order` — Spawn 后 model/effort 不乱
- `custom-agent-settings-parity` — reviewer 权限可配
- `delegation-target-policy` — 自动 Spawn 受策略约束（可阶段三再接）

## 拓展（单独 backlog change，不在 Phase 1）

- `automation-extensions-triggers` — 文件 watch、CI、Channel、Webhook…
- `automation-extensions-conditions` — llm_classify、diff 统计…
- `automation-extensions-actions` — auto merge、fan-out…
- `automation-extensions-ops` — import/export、shadow mode…
- `automation-extensions-integrations` — 全自动 to-do 流水线、编排图…

## Impact

编排子 change 的实现范围；本 change 仅路线图与验收标准。

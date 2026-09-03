## Context

见 `proposal.md`。现有 Automations 与 Task engine 分离；终端已有 `terminal://exit` 事件但未接 agent 唤醒。

## Goals / Non-Goals

**Goals:** 定义 Phase 1 验收标准、change 依赖图、实验闭环时序图。

**Non-Goals:** 本 change 不写代码；实现落在子 change。

## 实验闭环时序（阶段三目标）

```text
实验 Agent (E70)
    │ turn_completed
    ▼
Spawn cg-review + Initial Prompt（审计清单）
    │ turn_completed (reviewer)
    ├─ 通过 → 结束
    └─ 需纠正
           ▼
    Resume 实验 Agent + followup_prompt
           ▼
    新一轮实验 → 再 Spawn review …
```

## Change 依赖图

```text
event-lifecycle-bus
    ├── action-target-spawn-resume
    │       ├── turn-failed-auto-resume      [阶段一]
    │       ├── agent-wake-scheduler         [阶段二]
    │       └── experiment-audit-handoff     [阶段三]
    └── event-automation-spawn-agent         [阶段三]
```

## 与现有 Automations 边界

| | Automations | Event Rules |
|---|-------------|-------------|
| 触发 | schedule / manual | lifecycle 事件 |
| 动作 | LaunchSession / EnqueueTask | spawn_agent / send_to_conversation |
| 配置载体 | `AutomationConfig` | **同结构**，存于 Rule.then |

## 验收（阶段三完成时）

1. RetriableError 自动「继续」≤3 次，5s 冷却
2. `wake_on_process_exit` 后终端退出 → 原会话收到 prompt
3. `wake_after(30m)` 到期 → 原会话收到 prompt
4. 实验 turn_completed → cg-review 带 Initial Prompt 启动
5. review 完成 → 实验 Agent 收到 follow-up，chain_depth 有上限

## Open Questions

- Rule 存储：新表 `event_rules` 还是扩展 `automations` 加 `trigger_kind=event`？子 change 决定，倾向新表避免污染 cron 逻辑。

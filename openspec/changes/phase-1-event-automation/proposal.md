# Phase 1 Event Automation 产品收口路线图

## Why

9d685f36 提供错误续跑后端，但用户还不能独立配置规则，不能据此宣布 Phase 1 产品完成。后续审计必须由 reviewer 明确决定继续、改派或退出。

## What Changes

- Phase 1 = **1A 后端基础 + 1B 可实际使用的 Event Automation UI**。UI、keywords、ANY/ALL、regex、error_kind、prompt、max_attempts、cooldown、模板开关全部必需。
- 两个入口：Automations 的 Scheduled / Event 页签；Conversation header 独立 Event Automation 按钮。共用 event_rule 数据、编辑器和执行系统。
- Phase 2 = Wake Scheduler；Phase 3 = New/Existing reviewer、continue/reroute/exit、有限轮次、实验审计模板。后续阶段不再混称 Phase 1。
- 新建 event-automation-ui 负责 Phase 1B（包含必要的 scope、校验/预览、日志读取契约）；新建 reviewer-controlled-handoff 负责通用闭环。
- experiment-audit-handoff 收窄为实验模板和验收，取消固定双规则回传。

## Capabilities

本 change 仅协调路线图，沿用 skip_specs: true；具体行为契约由子 change 唯一负责。

| Change | 唯一责任 | 阶段 |
|---|---|---|
| event-lifecycle-bus | 事件、基础 matcher/CRUD | 1A |
| action-target-spawn-resume | 动作区分、稳定 conversation 引用及目标验证 | 1A/1B/3 |
| turn-failed-auto-resume | 可编辑 retry 模板、attempt/cooldown 语义 | 1A/1B |
| event-automation-ui | 双入口、scope/预览/日志契约、实机验收 | 1B |
| agent-wake-scheduler | 持久化 wake 注册与消费 | 2 |
| event-automation-spawn-agent | AutomationConfig 新会话启动、成功事件接入 | 3 |
| reviewer-controlled-handoff | 决策协议、chain、max_iterations/max_chain_depth、恢复 | 3 |
| experiment-audit-handoff | 实验审计模板和端到端案例 | 3 |
| agent-response-automation | 被取代的历史背景，非第二个 apply 队列 | 历史 |

## Impact

实施将涉及 EventRulesEngine、transport API、AutomationsPage、ConversationDetailHeader。本轮仅规划；保留用户未提交源码改动，不 apply/build release/PR/merge/push。

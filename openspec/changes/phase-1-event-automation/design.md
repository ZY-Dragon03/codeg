## Context

2026-09-05 审查 feature/event-automation-openspec / 9d685f36。当前是 design-only，现有源码存在用户未提交改动；代码存在性不等于实机可用。本轮未运行产品测试或真实 agent。

## Goals / Non-Goals

统一产品边界、change 所有权及依赖顺序。规划完成不代表 Phase 1 已完成；后续每阶段仍需实施授权。

## Decisions

### 冲突与裁定

| 原文件或代码 | 冲突/缺口 | 裁定 |
|---|---|---|
| turn-failed-auto-resume/tasks 1.2 | UI deferred | 恢复为 Phase 1B，交付归 event-automation-ui |
| 旧 phase-1 路线图 | 后端、Wake、review 混称 Phase 1 | Phase 1=1A+1B；Wake=2；review=3 |
| experiment-audit-handoff/spec | reviewer 完成必定 resume 原 worker | 有效决策和硬护栏共同控制派发 |
| action-target/design | 关闭后可新建/fallback spawn | Existing 保持身份；不能解析则可见失败 |
| event_rules/types.rs:5,77；models/event_rule.rs:20 | trigger 只有 turn_failed；无 scope | 1B 补 scope，只开放受支持 trigger |
| event_rules/matcher.rs:22 | condition kind 互斥 | 明示单一类型；ANY/ALL 仅作用于关键词 |
| event_rules/engine.rs:445 | specific target 沿用源 folder | 开放 UI target 前补目标 folder 验证 |
| event_rules/engine.rs:326 | first-match；guard 拦截不尝试下一规则 | 保留并展示；同 priority 增加 id 稳定排序 |
| agent-response-automation | 仅 proposal 标历史 | 全部 artifact 标 superseded，保留历史但不派工 |

### 最终模型

Event Rule = enabled + priority + scope + trigger + condition + action + retry guards。

scope 决定接受哪些事件；target 决定消息发往哪里，两者独立。Scheduled 和 Event 共用管理入口、保留各自触发记录；Event 只使用同一个 event_rule 和执行引擎。Initial Prompt 仅用于新建会话，已有会话只发 follow-up。New reviewer 复用 AutomationConfig；Existing reviewer 复用 conversation；动态 continuation 始终选择已有 conversation。

```text
worker completed --> review (new or existing)
                         |
                  structured decision
                         |
                    hard guards
                    /         \
                  exit    continue / reroute
                               |
                      existing conversation
                               |
                       correlated completion
                               |
                             review
```

### Phase 1 真正验收

1. 用户无需 API、DB 或 Agent，从两入口创建/编辑/启停/删除同一规则；刷新、重启后保存。
2. Trigger 在受支持范围可选（1B 为 turn_failed）；keywords、ANY/ALL、regex、error_kind、纯文本 prompt、max_attempts、cooldown 可编辑；条件类型互斥语义明确。
3. TLS/RetriableError 模板默认关闭、可编辑；修改关键词/prompt 后真实行为改变，启动不覆盖用户修改。
4. 会话 C 创建的 scope=C 规则不响应 D 的相同错误；全局页面编辑的是同一 id。
5. 样本预览复用真实 matcher 且无发送副作用；无效 regex、空关键词、空 prompt、无效 guard/target 可见报错。
6. 实际失败事件 settle 后只发送配置 prompt；max_attempts=3 无第 4 次自动发送，cooldown 内不发送。成功/30 分钟空闲 retry reset 与实现一致且 UI 有说明。
7. 日志可见源/目标、动作、guard 跳过与失败；关闭规则无动作。请求接收不显示为 agent 已执行完成。
8. Desktop/Web 分别留存 UI 操作、实际消息和日志证据，scheduled 回归通过；mock 测试或 OpenSpec valid 不等于产品验收。

### 推荐顺序与真实依赖

1. Phase 1B 契约差额（scope、target folder、校验/预览/日志）和 TS transport -> 共享编辑器/双入口 -> 实机验收。
2. Wake Scheduler 可按用户价值接着做，但**不是 reviewer 的代码前置依赖**；timer/terminal 是独立 producer。
3. 稳定 existing-target resolver + settled-success lifecycle + reviewer decision capability。Existing reviewer 最小闭环可以先于 spawn。
4. AutomationConfig spawn、新/已有 review target UI、通用 chain guards/recovery。
5. 实验模板：E70 补实验后退出、A->B 改派、第三轮强制退出验收。

依赖边：bus -> action -> UI/retry；bus+action -> wake；bus+action -> reviewer；AutomationConfig+action -> spawn；reviewer+spawn -> 完整实验模板。无 wake -> reviewer 必要边。

### 复用和延后

复用 event_rules、event_rule/attempt/log 表、commands/event_rule.rs/Web handlers、transport、AutomationsPage、ConversationDetailHeader、DbConversationSummary、ACP send/reconnect、AutomationConfig、codeg-mcp 注入/认证。不能由复用推断已有 scope/decision/recovery。

Phase 2+ 保留 Wake、reviewer、parent/spawned aliases。通用预算/状态表达式、LLM classifier、自然语言 PASS 解析、Webhook/CI/file watch、自动 merge、fan-out、跨主机会话和编排图不进入当前计划。用户停止、有限轮次、失败退出是闭环 V1 必需。

## Risks / Trade-offs

- 1B 仅 turn_failed；其余 trigger 在对应 producer 交付前不可启用。
- 1A 历史勾选保留，新增差额任务；本轮未重跑旧测试，实机状态 UNKNOWN_NOT_PROVEN。
- Phase 1 重启只验配置/模板/attempt 持久化；failure dedup 为进程内30秒 TTL，不保证跨重启事件去重，不自动重放内存 pending failure。该保障 UNKNOWN_NOT_PROVEN；Phase 3 reviewer chain 必须另交 durable correlation/recovery。
- 不同 backend 的 reviewer tool 能力不能假定一致；见 reviewer-controlled-handoff/design.md。

## Migration Plan

本轮仅文档并停止。未来为旧规则补 global scope 默认值，不重置模板/guard；chain 状态附着现有规则运行系统。关闭功能停止新动作、保留日志及会话身份。

## 本轮审查与验证记录（2026-09-05）

- 两个 Luna Explore 分别调查 UI/identity 与 runtime/decision；独立 Luna Reviewer 两轮复核，最终 DONE。
- 已解决 reviewer 指出的 Phase 1 TTL/dedup 跨重启保证边界。
- 10 个相关 change 均通过 openspec validate <change> --strict --no-interactive；两个新 change 的 proposal/specs/design/tasks 状态均为 done（仅规划完成）。
- git diff --check -- openspec 通过。本轮未修改业务源码、未运行产品测试/实机 agent、未 build release/commit/PR/merge/push；原工作区改动保留。
- openspec validate --specs --strict --no-interactive 失败于已有 cursor-worker-model 主规范：缺少标准 Purpose/Requirements 章节；该文件与 HEAD 无差异，未纳入本轮修改。

## 本轮文件清单

共 41 个 OpenSpec 文件：31 个现有 Markdown 修订、8 个新 Markdown、2 个 openspec new change 生成的元数据。下列清单相对于 openspec/changes。

- [action-target-spawn-resume/design.md](../action-target-spawn-resume/design.md)
- [action-target-spawn-resume/proposal.md](../action-target-spawn-resume/proposal.md)
- [action-target-spawn-resume/specs/action-target-spawn-resume/spec.md](../action-target-spawn-resume/specs/action-target-spawn-resume/spec.md)
- [action-target-spawn-resume/tasks.md](../action-target-spawn-resume/tasks.md)
- [agent-response-automation/design.md](../agent-response-automation/design.md)
- [agent-response-automation/proposal.md](../agent-response-automation/proposal.md)
- [agent-response-automation/specs/agent-lifecycle-rules/spec.md](../agent-response-automation/specs/agent-lifecycle-rules/spec.md)
- [agent-response-automation/tasks.md](../agent-response-automation/tasks.md)
- [agent-wake-scheduler/design.md](../agent-wake-scheduler/design.md)
- [agent-wake-scheduler/proposal.md](../agent-wake-scheduler/proposal.md)
- [agent-wake-scheduler/specs/agent-wake-scheduler/spec.md](../agent-wake-scheduler/specs/agent-wake-scheduler/spec.md)
- [agent-wake-scheduler/tasks.md](../agent-wake-scheduler/tasks.md)
- [event-automation-spawn-agent/design.md](../event-automation-spawn-agent/design.md)
- [event-automation-spawn-agent/proposal.md](../event-automation-spawn-agent/proposal.md)
- [event-automation-spawn-agent/specs/event-automation-spawn-agent/spec.md](../event-automation-spawn-agent/specs/event-automation-spawn-agent/spec.md)
- [event-automation-spawn-agent/tasks.md](../event-automation-spawn-agent/tasks.md)
- [event-automation-ui/.openspec.yaml](../event-automation-ui/.openspec.yaml)
- [event-automation-ui/design.md](../event-automation-ui/design.md)
- [event-automation-ui/proposal.md](../event-automation-ui/proposal.md)
- [event-automation-ui/specs/event-automation-ui/spec.md](../event-automation-ui/specs/event-automation-ui/spec.md)
- [event-automation-ui/tasks.md](../event-automation-ui/tasks.md)
- [event-lifecycle-bus/design.md](../event-lifecycle-bus/design.md)
- [event-lifecycle-bus/proposal.md](../event-lifecycle-bus/proposal.md)
- [event-lifecycle-bus/specs/event-lifecycle-bus/spec.md](../event-lifecycle-bus/specs/event-lifecycle-bus/spec.md)
- [event-lifecycle-bus/tasks.md](../event-lifecycle-bus/tasks.md)
- [experiment-audit-handoff/design.md](../experiment-audit-handoff/design.md)
- [experiment-audit-handoff/proposal.md](../experiment-audit-handoff/proposal.md)
- [experiment-audit-handoff/specs/experiment-audit-handoff/spec.md](../experiment-audit-handoff/specs/experiment-audit-handoff/spec.md)
- [experiment-audit-handoff/tasks.md](../experiment-audit-handoff/tasks.md)
- [phase-1-event-automation/design.md](../phase-1-event-automation/design.md)
- [phase-1-event-automation/proposal.md](../phase-1-event-automation/proposal.md)
- [phase-1-event-automation/tasks.md](../phase-1-event-automation/tasks.md)
- [reviewer-controlled-handoff/.openspec.yaml](../reviewer-controlled-handoff/.openspec.yaml)
- [reviewer-controlled-handoff/design.md](../reviewer-controlled-handoff/design.md)
- [reviewer-controlled-handoff/proposal.md](../reviewer-controlled-handoff/proposal.md)
- [reviewer-controlled-handoff/specs/reviewer-controlled-handoff/spec.md](../reviewer-controlled-handoff/specs/reviewer-controlled-handoff/spec.md)
- [reviewer-controlled-handoff/tasks.md](../reviewer-controlled-handoff/tasks.md)
- [turn-failed-auto-resume/design.md](../turn-failed-auto-resume/design.md)
- [turn-failed-auto-resume/proposal.md](../turn-failed-auto-resume/proposal.md)
- [turn-failed-auto-resume/specs/turn-failed-auto-resume/spec.md](../turn-failed-auto-resume/specs/turn-failed-auto-resume/spec.md)
- [turn-failed-auto-resume/tasks.md](../turn-failed-auto-resume/tasks.md)

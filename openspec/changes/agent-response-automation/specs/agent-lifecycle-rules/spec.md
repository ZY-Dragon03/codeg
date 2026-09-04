> SUPERSEDED / 历史背景，非实施 authority（2026-09-05）。请使用 phase-1-event-automation 路线图及 event-automation-ui / reviewer-controlled-handoff / 其子 change。下列旧术语、任务和规范仅保留历史，不派工、不勾成已实现，也不把 lifecycle_rules 等模型作为第二套规则系统。

## Purpose

让用户通过声明式规则，在智能体 turn 失败、正常结束、委派完成等事件上自动执行续跑、审计委派或后继任务，而无需人工盯屏或重复点击 Retry。

## ADDED Requirements

### Requirement: 系统必须发布智能体生命周期事件

系统 MUST 在 turn 失败、turn 正常结束、委派完成、自动化运行结束、任务进入 review 等节点发布结构化 `LifecycleEvent`，供规则引擎订阅。

#### Scenario: Turn 因连接错误失败

- **WHEN** 某会话 turn 失败且错误分类为 connection
- **THEN** 系统 MUST 发布包含 `event=turn_failed`、`error_kind=connection`、原始错误文本的 LifecycleEvent

#### Scenario: Turn 正常结束

- **WHEN** 某会话 turn 以 `end_turn` 结束且无未解决错误
- **THEN** 系统 MUST 发布 `event=turn_completed` 且 `stop_reason=end_turn`

### Requirement: 用户可配置条件规则

系统 MUST 允许用户创建、启用、禁用生命周期规则；每条规则 MUST 包含触发事件、条件与动作。

#### Scenario: 创建 TLS 可重试规则

- **WHEN** 用户创建规则：事件 `turn_failed`，文本包含 `RetriableError` 与 `TLS`，动作 `send_message` 内容为「继续」
- **THEN** 规则 MUST 持久化且可启用

### Requirement: 规则必须在匹配时执行确定性动作

系统 MUST 在规则条件满足时执行声明的动作，并记录执行结果。

#### Scenario: 网络错误自动发送继续

- **WHEN** 启用的规则匹配某 turn 的 TLS/RetriableError 失败
- **THEN** 系统 MUST 向同一会话发送配置的消息（如「继续」）
- **THEN** 系统 MUST NOT 要求用户手动点击 Retry（除非规则配置 `require_human_approve`）

#### Scenario: 达到最大重试次数

- **WHEN** 同一规则对同一会话已连续执行达到 `max_attempts`
- **THEN** 系统 MUST 停止自动执行该规则
- **THEN** 系统 MUST 记录事件并 MAY 通知用户

### Requirement: 正常结束时可自动委派审计智能体

系统 MUST 支持规则在 `turn_completed`（或等价成功事件）时委派指定智能体进行复核或汇总。

#### Scenario: 成功后自动审计

- **WHEN** 规则配置为 `turn_completed` 且动作为 `delegate_to_agent`，目标为 `cdx-review`
- **AND** 会话 turn 正常结束
- **THEN** 系统 MUST 委派 `cdx-review` 并传入可配置的审计 prompt 模板
- **THEN** 委派 MUST 受委派目标策略约束（若 `delegation-target-policy` 已启用）

### Requirement: 规则执行必须有护栏

系统 MUST 对规则链深度、冷却时间、每规则尝试次数提供可配置上限。

#### Scenario: 超过链深度

- **WHEN** 规则动作触发的新 turn 再次触发规则，且已达全局 `max_rule_chain_depth`
- **THEN** 系统 MUST 拒绝进一步自动动作并记录原因

### Requirement: 规则执行必须可观测

系统 MUST 将规则命中、跳过、动作成功或失败写入会话或任务时间线（或专用规则 run log）。

#### Scenario: 查看规则命中记录

- **WHEN** 用户打开相关会话或任务时间线
- **THEN** 用户 MUST 能看到哪条规则命中及执行了什么动作

### Requirement: 规则测试台

系统 MUST 提供在不启动真实 agent 的情况下，用样本输出预览规则是否命中的能力。

#### Scenario: 预览 TLS 样本

- **WHEN** 用户在规则编辑器粘贴含 `RetriableError` 的样本文本并点击测试
- **THEN** 系统 MUST 显示该规则是否命中及将执行的动作

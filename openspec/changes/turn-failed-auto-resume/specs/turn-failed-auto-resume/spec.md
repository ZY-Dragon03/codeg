## Purpose

在可重试的网络类 turn 失败时，自动向触发会话发送续跑消息，减少人工 Retry。

## ADDED Requirements

### Requirement: 可配置规则必须在匹配时向原会话发送续跑 prompt

系统 MUST 支持 turn_failed 规则，动作向 `source_conversation` 发送用户配置的 prompt（默认「继续」）。

#### Scenario: RetriableError 命中

- **WHEN** turn_failed 且输出含 `RetriableError`
- **AND** 启用内置模板规则
- **THEN** 原会话 MUST 收到「继续」

### Requirement: 必须强制执行 max_attempts 与 cooldown

系统 MUST 对每条规则在每个会话上独立计数尝试次数，并强制执行冷却时间。

#### Scenario: 第三次失败后停止

- **WHEN** 同一会话同规则已自动续跑 3 次
- **THEN** 系统 MUST NOT 再自动发送
- **THEN** 系统 MUST 记录已达上限

#### Scenario: 冷却期内忽略

- **WHEN** 上次自动续跑距今不足 5 秒
- **THEN** 系统 MUST NOT 再次发送

### Requirement: 条件求值不得使用 LLM

V1 规则 MUST 仅使用 contains、regex、error_kind 进行条件匹配。

用户 MUST 能通过共享 Event Automation 编辑器编辑关键词、ANY/ALL、regex、error_kind、prompt、max_attempts、cooldown 和模板启停；该能力属于 Phase 1 验收。

#### Scenario: 无 LLM 分类器

- **WHEN** 用户配置 turn_failed 规则
- **THEN** 系统 MUST NOT 调用 LLM 判断条件

#### Scenario: 模板修改实际生效

- **WHEN** 用户在 UI 将模板关键词改为 X、prompt 改为 Y 并启用
- **THEN** 系统 MUST 按新条件发送 Y，重启 MUST 保留修改
- **THEN** 系统 MUST NOT 继续使用硬编码 TLS 判断覆盖用户配置

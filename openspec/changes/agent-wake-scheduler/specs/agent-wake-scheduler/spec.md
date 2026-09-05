## Purpose

允许 Agent 登记在终端进程退出或指定时间到达时，向原会话自动发送 follow-up 消息，无需新建 Agent 或 Initial Prompt。

## ADDED Requirements

### Requirement: Agent 必须能登记 wake_on_process_exit

系统 MUST 提供 API 或 MCP 工具，使 Agent 可登记在指定终端进程退出时向原会话发送 prompt。

#### Scenario: 长脚本跑完唤醒

- **WHEN** Agent 调用 `wake_on_process_exit` 并关联 `terminal_id` T 与 prompt P
- **AND** 终端 T 进程退出
- **THEN** 原会话 MUST 收到 prompt P

### Requirement: Agent 必须能登记 wake_after 与 wake_at

系统 MUST 支持相对时间与绝对时间的定时唤醒，且定时器 MUST 持久化。

#### Scenario: 30 分钟后检查

- **WHEN** Agent 调用 `wake_after(30 minutes)` 与 prompt P
- **THEN** 30 分钟后原会话 MUST 收到 P
- **THEN** Codeg 重启后 MUST 仍能触发

### Requirement: Wake 必须仅 resume 已有会话

Wake 触发时系统 MUST 仅向已有会话发送 follow-up，MUST NOT spawn 新 agent。

#### Scenario: 不 spawn 新 agent

- **WHEN** Wake 触发
- **THEN** 系统 MUST 使用 `send_to_conversation` 语义
- **THEN** 系统 MUST NOT 要求 Initial Prompt

### Requirement: terminal_exited 必须发布生命周期事件

终端退出且存在相关 Wake 时，系统 MUST 向事件总线发布 `terminal_exited`。

#### Scenario: 事件总线集成

- **WHEN** 终端退出且存在匹配 Wake
- **THEN** 系统 MUST 发布 `terminal_exited` 事件

#### Scenario: 观察事件不重复唤醒

- **WHEN** 同一个 Wake 已经消费并发布生命周期事件
- **THEN** 系统 MUST NOT 因观察到该事件再次执行同一 Wake 的 send

### Requirement: Wake registration MUST be authenticated and identity-bound

Only an authenticated companion for the current source conversation may create or cancel its wakes. `prompt` MUST be non-empty; durations and timestamps MUST be valid and future-facing. Process-exit registration MUST include a stable terminal/process identity; the scheduler MUST reject a “most recent terminal” guess.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Wake persistence MUST be restart-safe and idempotent

Each row MUST retain `wake_id`, source conversation identity, trigger, prompt, scheduled time/process identity, status and receipt/error. Pending due timers MUST be recovered on restart and claimed with a compare-and-set transition so a one-shot is consumed at most once. Target unavailable/deleted/busy failures remain attached to the original target and MUST NOT spawn.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Wake and lifecycle observation MUST share execution

All wake sends MUST use the shared existing-target resolver/executor and structured logs. Publishing `terminal_exited` or `timer_fired` MUST NOT cause the same wake to dispatch a second time.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

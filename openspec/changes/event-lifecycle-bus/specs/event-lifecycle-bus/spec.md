## Purpose

为事件驱动自动化提供统一的生命周期事件发布与规则匹配基础，避免各功能在 ACP 连接层重复 hook。

## ADDED Requirements

### Requirement: 系统必须发布 turn_failed 生命周期事件

当 ACP 会话一轮失败时，系统 MUST 发布包含会话标识、错误分类与原始错误文本的 LifecycleEvent。

#### Scenario: 连接类失败

- **WHEN** turn 失败且 workspace 错误条分类为 connection
- **THEN** 事件 MUST 含 `event=turn_failed` 与 `error_kind=connection`

### Requirement: 规则必须可按 trigger 与 condition 匹配

系统 MUST 持久化事件规则，并在收到 LifecycleEvent 时求值 trigger 与 condition。

#### Scenario: 无 condition 规则

- **WHEN** 规则 trigger 为 `turn_failed` 且 condition 为 `none`
- **THEN** 该规则 MUST 在每次 turn_failed 时匹配

#### Scenario: contains 条件

- **WHEN** 规则 condition 要求文本同时包含 `RetriableError` 与 `TLS`
- **AND** 事件文本满足
- **THEN** 规则 MUST 匹配

### Requirement: 规则匹配结果必须可观测

系统 MUST 记录规则命中或未命中；本基础 change 可先用 debug 日志，但完整 Phase 1 产品 MUST 通过 event-automation-ui 提供可读执行/guard 日志，不能以基础后端完成免除 UI。

#### Scenario: 命中记录

- **WHEN** 某规则匹配 turn_failed 事件
- **THEN** 系统 MUST 记录规则 id 与事件 id 的关联

### Requirement: Lifecycle envelope MUST carry stable turn identity

Every settled lifecycle event MUST contain `event_id`, canonical
`conversation_id`, `folder_id`, `agent_type`, a stable per-turn `turn_id`,
trigger, stop reason, merged error fields and the final assistant output
snapshot when available. Connection/session identifiers are runtime metadata;
an ACP session id MUST NOT identify multiple turns.

#### Scenario: Persistent session has two turns

- **WHEN** one ACP session completes two turns
- **THEN** the events MUST have different `turn_id` values even though the
  session id is the same

### Requirement: Failure signals MUST settle and merge before dispatch

`SessionFailure` and `AcpEvent::Error` for one turn MUST merge regardless of
arrival order. A concrete error kind MUST replace `unknown`; title, details,
message and text MUST all remain available. The event MUST be emitted only
after `TurnComplete` has settled the turn.

#### Scenario: Either error arrives first

- **WHEN** SessionFailure then Error, or Error then SessionFailure, arrive for
  one turn
- **THEN** one settled `turn_failed` event MUST be emitted with both texts and
  the concrete error kind

### Requirement: Streaming content MUST never dispatch early

Content matching during `ContentDelta` MAY set a pending match, but MUST NOT
send a prompt while the turn is in flight. `TurnComplete(stop_reason=end_turn)`
is the only normal completion trigger; refusal, cancellation and failure are
not normal completion.

#### Scenario: Match during streaming

- **WHEN** assistant text matches a content rule before the turn settles
- **THEN** no target receives a message until the settled event is processed

### Requirement: Lifecycle dedup MUST be observable

The engine MUST correlate structured logs with `event_id`/`turn_id` and MUST
avoid duplicate dispatch for the same turn, rule and target. Cross-restart
exactly-once remains `UNKNOWN_NOT_PROVEN` unless a durable receipt is added.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

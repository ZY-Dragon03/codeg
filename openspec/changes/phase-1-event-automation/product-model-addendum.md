# Phase 1 product model and evidence addendum

This addendum is the current product contract for the implementation on
`feature/event-automation-current`. It supersedes older wording that treated
Wake as an action or required a reviewer orchestration protocol.

## Single registry

The Automation Registry is a projection over the authoritative `event_rule`
and `agent_wake` tables. It must expose user and Agent provenance, lifecycle
status, applicability to the current conversation, stable ordering, and
searchable rule/wake descriptions. A Wake remains a trigger (after, at, or
process exit); it is never represented as a send action.

## Phase boundaries

Phase 1 sends prompts only to existing conversations. It includes durable
after/at/process-exit Wake triggers. It does not implement
`spawn_agent`, fan-out graphs, webhooks, merge automation, a reviewer decision
DSL, or budget policies. The light reviewer loop is composed from completion
forwarding, the authenticated conversation send/read tools, and the unified Wake
registry. Reviewer orchestration remains a later consumer and is not redesigned
or required for Phase 1.

## Authorization

An Agent companion is bound to its parent conversation by its launch token. It
may access that conversation and targets explicitly recorded by an enabled
automation policy. Every dispatch re-reads the target row and selects a
Connected, idle runtime whose folder and conversation identity match the row.
Database existence is reported separately from runtime availability. A
dynamic reviewer target must pass the same policy check at dispatch time;
failure is fail-closed and never expands the target set.

## Trigger semantics

Content matches are provisional while streaming and dispatch only after the
turn settles. Completion forwarding is emitted only for the real
`TurnComplete(end_turn)` path, and carries the most recent non-ignored user
message and the current turn's final assistant report. Failure/cancel/refusal
does not count as completion. SessionFailure and ACP Error data are merged with
specific values winning over `unknown` regardless of arrival order.

## Reviewer policy (future heavy orchestration)

The future reviewer protocol must persist requested/effective decisions and an
override reason. Missing or invalid decisions default to STOP. A successful
reviewer turn with a missing decision counts one settled iteration before
stopping; ACP failure/cancel and duplicate completion do not increment the
counter. Dynamic targets are constrained by a frozen allowed-target policy and
rechecked before dispatch.

## Evidence vocabulary

OpenSpec checkboxes describe artifact or test work only. Product claims use
`CODE_PROVEN`, `TEST_PROVEN`, `RUNTIME_PROVEN`, or `UNKNOWN_NOT_PROVEN` and
must include branch/commit, source and target identities, actual prompt, log
receipt, and platform. A schema entry or unit test is not a real Agent
capability receipt.

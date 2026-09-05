# Phase 1A independent review

Date: 2026-09-05
Base: `upstream/main` `1f86f62a1b0b29464800cccc869ebd7391fcdabe`
Review scope: current-backend Phase 1A only. Preview and structured log read APIs are deliberately excluded from this gate because they are the parallel Phase 1B backend contract.

## Verdict: FAIL (two P1 fixes required)

The port is structurally adapted to the current ACP implementation and the targeted test suite passes, but two runtime guards are not yet sufficient for the Phase 1A contract.

### P1: user cancellation is treated as `turn_failed`

`src-tauri/src/event_rules/engine.rs:213-263` handles every `TurnComplete` other than `end_turn` as a failure when no pending failure exists. That includes `stop_reason == "cancelled"`. The current ACP connection explicitly documents cancellation as user-driven and emits no failure error (`src-tauri/src/acp/connection.rs:8551-8568`); the event-rule engine therefore must return without matching or sending for a cancelled turn. As written, cancelling a prompt can fire the automatic resume rule and send the configured follow-up. Add a cancelled branch before the fallback failure construction and cover it with a test.

### P1: send path does not verify connection status is live

`src-tauri/src/event_rules/engine.rs:428-441` verifies persistent conversation/folder identity and `turn_in_flight`, but accepts any connection state returned by `get_state`, including `Connecting`, `Disconnected`, and `Error`. `ConnectionStatus` has these explicit variants (`src-tauri/src/acp/types.rs:982-988`). The requirement is a live idle target: require `ConnectionStatus::Connected` (or the precise current idle status if upstream defines one) before reserving/sending, and test a stale/disconnected state. The error path should remain visible and should not fallback to spawn/reconnect.

## Review checks that passed

- No mechanical overwrite of the newer ACP manager/session/delegation code was found in the current event-rule port. The engine uses `InternalEventBus`, `AcpManager::find_connection_by_conversation_id`, and `send_prompt_linked_with_message_id` (`src-tauri/src/event_rules/engine.rs:13-20, 410-449`).
- Desktop and server bootstrap both create and start the engine against the current event bus (`src-tauri/src/lib.rs:888-897`; `src-tauri/src/bin/codeg_server.rs:317-323`).
- SessionFailure (terminal error) and turn Error are buffered per connection and evaluated only at TurnComplete (`engine.rs:101-120, 130-220`). ACP emits the terminal SessionFailure before TurnComplete (`src-tauri/src/acp/connection.rs:9148-9170`), so the intended settle ordering is respected.
- Dedup keys include the persistent conversation, ACP session, failure id/text fingerprint, and the current completed-turn marker (`engine.rs:238-279`; `dedup.rs:18-28`). This prevents same-turn SessionFailure/Error duplication while allowing later turns in the same ACP session to produce distinct keys. There is a unit test for the paired SessionFailure/Error path (`engine.rs:783-830`), although a direct same-text-across-two-turn regression test would improve evidence.
- Target resolution reads the target conversation row and its own folder, rejects missing/deleted targets, resolves the live connection by persistent conversation id, and passes target folder/conversation to the current linked send API (`engine.rs:410-449, 459-481`).
- Matcher applies trigger, scope, condition, and current DB ordering; the persistence query orders priority descending and id ascending (`matcher.rs:8-18`; `event_rule_service.rs:40-46, 135-145`). First match is selected and no fallback rule is attempted after a guard decision (`engine.rs:329-365`).
- Guard accounting is transactionally reserved per `(rule_id, conversation_id)`, enforces cooldown/max attempts, resets after 30 minutes of inactivity, and resets on successful `end_turn` (`event_rule_service.rs:152-227`; `engine.rs:213-231`). Cooldown and max-attempt skip logs are emitted (`event_rule_service.rs:180-204`).
- CRUD calls reload enabled rules through the process handle after create/update/enable/delete (`src-tauri/src/commands/event_rule.rs:15-75`). The migration seeds the disabled retriable template and creates rule/attempt/log tables (`src-tauri/src/db/migration/m20260904_000001_event_rules.rs:1-180`).

## Verification receipts

- `cargo check --no-default-features --bin codeg-server` — PASS (reported by implementation agent on the current worktree).
- `cargo test --no-default-features --lib event_rules::` — PASS, 15 tests (reported by implementation agent; covers matcher, validation, CRUD hot reload, settle ordering, paired-error dedup, send path, max attempts, cooldown, and reset).
- Independent source review — FAIL on the two P1 findings above. Preview/structured-log endpoint absence was intentionally not scored at this Phase 1A gate.

The gate can become PASS after the cancellation exclusion and explicit live-status check are implemented and the focused tests pass.

## Re-review

Date: 2026-09-05

The implementation changes now address both previously reported runtime defects:

- `engine.rs:240-244` returns immediately for `stop_reason == "cancelled"`, so user cancellation no longer synthesizes `turn_failed`.
- `engine.rs:446-449` requires `ConnectionStatus::Connected` before sending a follow-up.
- The dedup key is actually constructed with the per-session turn marker in both paths (`engine.rs:257-264` fallback and `engine.rs:280-285` pending failure), and the marker is captured from `SessionState::turns_completed` (`engine.rs:312-317`).

However, the requested regression tests are absent. `rg` finds no cancellation test, no disconnected/non-connected status test, and no engine-level same-text-across-two-turn test. The existing dedup test (`engine.rs:830-876`) only proves one paired SessionFailure/Error sequence fires once; `dedup.rs:52-55` only checks a manually supplied key format and does not prove that two completed turns with the same text are admitted independently.

### Re-review verdict: FAIL (P1 evidence gap)

The two runtime fixes are source-correct on inspection, but Phase 1A cannot be accepted until focused tests lock down all three regression claims: cancelled turns do not send, non-Connected targets do not send, and identical text in two distinct turn markers is not swallowed. Preview and structured-log contract remain outside this re-review.

### Re-review receipt

- `cargo test --no-default-features --lib event_rules:: -- --nocapture` was started in the current worktree but remained blocked on the shared Cargo build-directory lock while the backend implementation test run was active; no independent completion receipt was available during this review window.

## Evidence closure

Date: 2026-09-05

The three tests requested by the independent re-review were added without
changing the reviewed guard decisions:

- `cancelled_turn_does_not_send`
- `disconnected_target_does_not_send`
- `identical_failures_in_distinct_turns_both_send`

`cargo test --no-default-features --lib event_rule -- --nocapture` completed
with **24 passed, 0 failed**. The same run also covers the Phase 1B backend
contracts `preview_evaluates_disabled_draft_without_side_effects` and
`structured_logs_page_by_rule_and_conversation`.

### Final Phase 1A verdict: PASS

The independent review found the corrected cancellation, live-connection, and
turn-marker logic source-correct. The focused regression suite now supplies the
missing executable evidence for all three claims.

The real Web run also exposed and closed a current-architecture identity edge:
when reconnect/session preservation leaves multiple live connections for one
persistent conversation, `source_conversation` now uses the event's exact
connection while `specific_conversation` retains manager lookup. This prevents
an automatic follow-up from landing on an older session.

## Current-baseline review fixes (2026-09-05)

The formal review fixes on `feature/event-automation-current` are complete:

- `m20260905_000001_event_rule_log_structured` is a separate, idempotent
  compatibility migration. It checks `pragma_table_info` for every structured
  log column and only issues a missing-column `ALTER TABLE`.
- Rule CRUD now returns reload errors to the caller. Reload uses bounded
  100ms/500ms retries and replaces the in-memory rule set only after a
  successful read, so a failed runtime reload cannot be reported as a
  successful disable/delete/update.
- `PendingTurnFailure` merges SessionFailure title/details with Error
  message/details in either arrival order. `unknown` never replaces a more
  specific `error_kind`; both orders are covered by an executable test.
- Specific-conversation actions choose a deterministic eligible connection
  whose conversation identity matches and whose state is Connected, idle, and
  free of pending permission/background work. Busy/disconnected sibling
  connections are covered by manager and engine tests.
- Preview now reports `target_exists` separately from runtime
  `target_available`; a persisted row without an eligible runtime is no longer
  described as available.
- Conversation Event Automation shows applicable conversation, folder,
  agent-type, and global rules and labels inherited folder/agent/global rules
  explicitly. The shared editor and header dialog continue to use the same
  rule and log APIs.
- Execution-log writes use bounded retries and emit an ERROR with the
  action-may-have-been-sent context if the final append still fails.

Focused receipts after these changes:

- `cargo check --no-default-features --bin codeg-server` — PASS.
- `cargo test --no-default-features --lib event_rules::engine::tests` — 12
  passed, including merge-order and multi-connection target tests.
- `cargo test --no-default-features --lib acp::manager::tests::find_eligible_connection_skips_busy_or_disconnected_siblings` — PASS.
- `cargo test --no-default-features --lib commands::event_rule::tests` — 3
  passed, including target existence/runtime preview semantics.
- `cargo test --no-default-features --lib db::migration::m20260905_000001_event_rule_log_structured::tests` — PASS.
- `pnpm exec tsc --noEmit` — PASS.
- Targeted Vitest for the event-rule editor, Automations page, and conversation
  header — 17 passed. Existing `act(...)` warnings in Automations page tests
  remain non-failing.

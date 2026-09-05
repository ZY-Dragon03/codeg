# Backend report

## Current progress

- Architecture delta recorded before edits in `backend-architecture.md`.
- Restored the Phase 1 event rule backend against current ACP APIs: typed
  `InternalEventBus`, current connection lookup, and
  `send_prompt_linked_with_message_id`.
- Registered event-rule entities, service, commands, web handlers, migration,
  and the lifecycle engine in both server and desktop boot paths.
- Added `scope` to the wire config with global default and conversation/folder/
  agent matching. Rule lists now use priority descending then id ascending.
- Validation now rejects invalid Rust regex, empty/blank contains keywords,
  blank prompt, invalid specific target shape, invalid attempt count, and
  excessive cooldown. Specific targets are resolved from persistent DB rows at
  execution time and deleted targets fail visibly.
- Existing engine behavior retains turn-failure coalescing, settle ordering,
  deduplication, max-attempt/cooldown guards, idle reset, and hot reload.
- Dedup identity now includes the current `SessionState::turns_completed`
  marker (alongside ACP session id and failure fingerprint), so repeated errors
  in separate turns are not swallowed merely because an ACP session persists.

## Verification

Verified:

- `cargo check --no-default-features --bin codeg-server` — PASS.
- `cargo test --no-default-features --lib event_rule -- --nocapture` — PASS (24 tests).

The targeted suite covers matcher modes, validation, CRUD hot reload, settle
ordering, duplicate SessionFailure/Error coalescing, send path, max attempts,
cooldown, and reset. The generated `out` directory is now present from the
verified production frontend build, so the desktop check below covers the
default feature path as well.

## Phase 1B contract additions

Added server-authoritative `event_rule_validate`, `event_rule_preview`, and
`event_rule_list_logs` cores, Web handlers/routes, and Tauri commands. Preview
uses the Rust scope/condition matcher, evaluates disabled drafts, inserts the
draft into priority/id overlap ordering, resolves source/specific targets from
the persistent conversation table, and performs no attempt reservation,
prompt send, or log write. Log reads support rule/conversation filters and an
ID cursor with structured status mapping (`fired`, `skipped`, `failed`) and
nullable historical snapshot fields.

Server check after these additions: `cargo check --no-default-features
--bin codeg-server` — PASS. The shared `AppState` initializer is reconciled
in both desktop and Web paths.

## Final verification update

- `cargo test --no-default-features --lib event_rule -- --nocapture` — PASS,
  24 passed and 0 failed, including the three independent-review regressions,
  preview side-effect isolation, and structured log pagination/filtering.
- `cargo check --no-default-features --bin codeg-server` — PASS after the final
  integration-diff cleanup, with no project warning.
- `cargo check` — PASS after generating the static frontend output; the only
  message is the expected development placeholder notice for an unprepared
  `codeg-mcp` sidecar.

The shared `AppState` initializer is reconciled in both desktop and Web paths,
and the Phase 1A independent gate is now PASS.

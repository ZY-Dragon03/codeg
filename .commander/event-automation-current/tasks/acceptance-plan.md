# Phase 1 product acceptance plan

Use a fresh run root under `.commander/event-automation-current/runtime/`. Set
both `CODEG_DATA_DIR` and `CODEG_HOME` to that same absolute path before each
server or desktop start. Set an isolated `NPM_CONFIG_PREFIX` containing the ACP
fixture. Web binds only `127.0.0.1:4310` and uses a temporary bearer token;
the transparent local gateway on `4311` routes `/api` and WebSocket traffic to
Rust and all other requests to the Next dev server. It does not mock responses.

The ACP fixture is registered through `acp_save_custom_agent`, connected with
`acp_connect`, and receives prompts through the normal ACP manager. Fixture
creation and read-only assertions may use the supported API. Every event-rule
create/edit/enable/disable/delete operation in product acceptance must be done
through the rendered UI. Rule APIs may be exercised separately as transport
tests, but do not satisfy the product flow.

Capture browser screenshots, fixture prompt receipts, server/desktop logs,
event-rule structured logs, and the final rule list. Exercise:

1. Web UI rule CRUD with custom keyword `MY_CUSTOM_ERROR_123`, editable prompt,
   conversation C scope, and enable/disable/delete.
2. D receives the same failure without firing; C fires. The global page and
   header editor show the same persistent rule id.
3. Preview valid/invalid-regex behavior and prove preview added no fixture
   receipt, attempt reservation, or execution log.
4. max_attempts=3, fourth skip, cooldown, success reset, same-turn duplicate
   coalescing, and distinct-turn identical failures.
5. first-match priority/shadowing and the V1 no-fallback behavior after the
   winning rule is guard-blocked.
6. specific existing target resolves its own persistent conversation id and
   folder and receives the configured prompt.
7. Restart Web and Desktop against the same respective isolated data root and
   verify rule/template/user edits and guard state persistence.
8. Repeat rule CRUD and delivery from the actual Tauri WebView via WebView2
   CDP. If the CDP port cannot expose the application page, mark Desktop visual
   interaction NOT_PROVEN rather than substituting frontend mocks.
9. Regress Scheduled list/create/edit/enable/disable and page rendering.

The fixture proves the Codeg ACP lifecycle and configured prompt receipt. It
does not claim an external model response. Phase 1 intentionally does not
claim cross-process failure-event exactly-once behavior.

## Web acceptance receipts (2026-09-05)

The loopback Web run used the real `codeg-server` binary, the static browser
client through the incremental Next development gateway, the isolated SQLite
root under `runtime/web-live`, and the installed ACP fixture. UI evidence:

- Automations opened with both Scheduled Automations and Event Automations;
  Scheduled remained renderable after switching tabs.
- A conversation-scoped rule was created in the rendered editor, previewed,
  saved, edited, disabled, re-enabled, and read back from the independent
  ConversationDetailHeader button. The header dialog showed the same rule id,
  the current conversation scope, the applicable Global template, and the
  structured execution log.
- Invalid Rust regex preview returned the readable server validation error
  `validation error: invalid regex: regex parse error: [ ^ error: unclosed
  character class`; it did not create an attempt, prompt receipt, or log.
- A real failure with `MY_CUSTOM_ERROR_123` generated an AIR terminal failure;
  the engine sent `AUTO_RESUME_PHASE1` through the normal ACP connection and
  the fixture recorded a successful second prompt. After a server restart the
  rule remained enabled and the log remained readable.
- A UI-created priority-50 source rule exercised three fired attempts and a
  fourth `skipped_max_attempts` log. The exact source session was retained when
  multiple connections existed for one persistent conversation.
- The same UI rule was edited to a specific persisted target. After the target
  connection was bound by a normal prompt, a source failure produced a
  successful `IDENTITY_AUTO` prompt in the target fixture session; the log
  recorded `source_conversation_id=4` and `resolved_target_id=6`.

The first Web run also caught and fixed two runtime defects before these
receipts were accepted: a missing TooltipProvider that crashed the workspace,
and a transient SQLite guard reservation lock that now has the bounded
100ms/500ms retry policy used by the current lifecycle subscriber. A later
source-identity check caught and fixed stale-connection selection for source
actions.

## Desktop incremental receipt (2026-09-05)

`pnpm tauri dev` was started from this branch with `CODEG_SKIP_SIDECAR=1` so
the normal Tauri before-dev path used the incremental Next server. The Rust
desktop binary compiled with the Phase 1 commands and launched as
`src-tauri/target/debug/codeg.exe` with a `Codeg` main window; the dev run
reached the `/workspace` route and was then closed cleanly. The build emitted
only the repository's existing warning about the intentionally skipped local
`codeg-mcp` sidecar. The environment does not expose a native-app surface or
WebView2 CDP target to the CUA browser, so direct desktop visual interaction
is recorded as `NOT_PROVEN` (the explicit `http://127.0.0.1:9223/json/list`
probe was refused and the Windows Computer Use `sky` service is not configured);
the desktop compile/launch receipt and the full Web transport receipt remain
separate evidence.

## Local schema compatibility receipt (2026-09-05)

Before using the installed current release, all existing Codeg processes were
closed and the real database was copied to
`C:\Users\Asus\AppData\Roaming\app.codeg\codeg.before-event-automation-schema-fix.20260905.db`.
The source and backup SHA-256 were both
`FDA9AD16C1E41009CECA8771EF810D01A5D33D7D76F5919D57F526A31EB2D276`.

The pre-repair `event_rule_log` schema had only the legacy six columns. A
guarded Python `sqlite3` repair added only the missing columns
`source_conversation_id`, `resolved_target_id`, `trigger`, `action`,
`prompt_snapshot`, and `guard_reason`; the post-repair PRAGMA confirmed all
six. A schema/row comparison against the backup showed no non-log table or row
changes, the existing `event_rule` row remained enabled, and no logs were
cleared. The compatible formal migration is now
`m20260905_000001_event_rule_log_structured` and checks each column before
adding it, so it is safe after this manual repair.

`src-tauri/target/release/codeg.exe` launched with a Codeg window from the
current branch. Native app/WebView inspection is unavailable in this Codex
session, so direct visual checks for the Event Automations list, execution-log
page, and conversation-header button remain `NOT_PROVEN`; no claim is made
from a mocked browser surface. The existing `retriable_error_auto_resume` row
was present with `enabled=1`.

# Backend architecture delta (current `upstream/main` vs `9d685f36`)

Recorded before Phase 1A edits on 2026-09-05.

The current base is substantially newer in ACP and application plumbing. The
窄范围 comparison shows new or changed ACP lifecycle/event-bus plumbing,
connection and session state, identity-aware manager helpers, delegation
transport/broker code, app-state event-bus registration, and server/web event
bridging. The current base also adds canvas/folder-group entities and
migrations while removing the old event-rule command/entity/service/migration
files. Therefore the event-rule port must be rebuilt against current APIs,
preserving the current manager and connection implementation.

Relevant current APIs found in source before edits:

- `acp::InternalEventBus` and typed `EventEnvelope` are the lifecycle
  subscription path in both desktop and server modes.
- `AcpManager::find_connection_by_conversation_id` resolves a live connection
  from the persistent conversation identity.
- `AcpManager::send_prompt_linked_with_message_id` is the current send path,
  preserving the sender/turn linkage expected by the current ACP manager.
- `EventEmitter` and web event bridging already carry the event bus in both
  Tauri and WebOnly runtimes.
- Current `app_state`, ACP manager/connection/session code, delegation broker,
  and migrations contain upstream changes relative to the old implementation;
  none are mechanically overwritten.

The comparison was limited to ACP, identity/connection/delegation/bootstrap,
app state, migrations, commands, models, and web handlers. The old event-rule
files appear as deleted in the comparison, confirming that the implementation
must restore the feature as a current-base adaptation.

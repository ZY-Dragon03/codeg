# Frontend Phase 1B implementation handoff

Read `INTENT.md`, `PLAN.md`, `frontend-architecture.md`, backend types/commands,
and the event-automation-ui OpenSpec artifacts first. Backend wire types are
authoritative; do not duplicate the Rust matcher or infer preview locally.

Ownership is `src/lib/types.ts`, `src/lib/api.ts`, shared Event Automation
components/context/tests, `automations-page.tsx`, conversation header/panel
wiring, and all 10 locale message files. Do not modify Rust, `.commander`,
package dependencies, runtime scripts, Git state, or Phase 2/3 features.

Implement one shared `EventRuleEditor` with visible WHEN / IF / THEN / GUARD
sections. Only `turn_failed` is available. Conditions are mutually exclusive:
None, Contains (editable nonblank keyword chips/rows and ANY/ALL), Regex, and
Error Kind. Use a plain textarea for the editable follow-up prompt. Expose
enabled, name, priority, global/conversation/folder/agent scope, source/specific
target, max attempts, and cooldown in seconds with clear units. Specific target
options come from `listAllConversations`, showing title/folder/agent and saving
the persistent integer conversation id.

Automations gains Scheduled Automations and Event Automations tabs without
changing the existing scheduled editor/behavior. Event list supports create,
edit, save, enable/disable, delete, preview, structured paginated logs, visible
scope labels, priority, winner/shadowed/no-fallback guard explanation, and
backend errors. The built-in disabled template is ordinary editable data.

ConversationDetailHeader renders an independent Event Automation button before
the overflow menu, with icon+tooltip at narrow width. It opens the same editor,
initially scoped to the current persistent conversation id; it lists that
scope's rules plus applicable Global rules labeled Global. Editing Global warns
that all conversations are affected. A null/draft conversation disables scoped
creation with an explicit persistence explanation. Do not inject composer text.

Refetch Event rules on page/dialog open, every CRUD mutation, window focus, and
transport reconnect; V1 does not add a changed broadcast. Preserve stale
request protection where appropriate.

Tests must cover the Event tab and Scheduled regression; editor keyword
add/edit/delete and ANY/ALL; regex/error-kind/guards/prompt/scope/target payload;
backend preview/log rendering; header button, shared editor, current scope,
Global warning, and null id; Desktop invoke and Web HTTP wrapper parity. Use
existing testing conventions and meaningful behavioral assertions. Run targeted
Vitest, direct TypeScript noEmit, and ESLint on owned files. No release build.

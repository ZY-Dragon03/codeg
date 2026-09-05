# Latest upstream UI evidence
Read-only Luna Ohm audit, base 1f86f62a (0.30.2). Old worker retained prior sandbox and could not write report; root records its findings.
- AutomationsPage :218-305 state; :434 toolbar; :514 editor/gallery/detail. Preserve Scheduled branch and add Event tab.
- ConversationDetailHeader :66 props DB conversationId vs runtimeConversationId; :263 overflow. Put independent button before overflow; null draft disabled; no Composer injection.
- listAllConversations api.ts:1989 is full selector source, not opened tabs; DbConversationSummary types.ts:398 provides id/title/folder/agent.
- automations-view-context :52-92 initial/reconnect fetch and stale response guards. Event open/focus/reconnect/CRUD refetch without new broadcast.
- Shared EventRuleEditor in components/automations, plain prompt; mutually exclusive condition types; keywords ANY/ALL; scope independent of target; preview/logs use Rust authority.
- Frontend owns types/api, event editor/view/context, AutomationsPage tabs, ConversationDetailHeader button, i18n and tests. Root owns package tooling and actual E2E harness. Backend owns all src-tauri.
- All code is absent on upstream, backend wire contract must precede UI implementation. Scope/validate/preview/structured pagination/target-folder checks are prerequisites.

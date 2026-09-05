# Routing
Lead: native Codex root, owns intent, baseline, integration and product acceptance.
Backend Implement: Luna backend_current (fresh full-access worker), owns src-tauri.
Frontend Explore: Luna ui_evidence completed read-only; implementation follows backend review.
Acceptance fixture: Luna acceptance_fixture, owns scripts/event-automation-e2e.
Independent Review: fresh Luna reviewer at each completed checkpoint, read-only product files.
Earlier planning_review provided a read-only acceptance plan; its old sandbox could not write the sibling worktree. Root persisted relevant findings; no sandbox workaround was used.
Native agents explicitly authorized by user in place of Codeg delegate_to_agent. No nested delegation/worktrees. All workers exact shared workdir; disjoint write ownership.

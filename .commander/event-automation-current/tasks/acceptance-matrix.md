# Phase 1 acceptance matrix

Fill each row only from a current receipt. Code/unit evidence never substitutes
for Web or Desktop product evidence.

| Claim | Code/test | Web product | Desktop product | Evidence |
|---|---|---|---|---|
| UI create/edit/save/enable/disable/delete | PASS (Rust + UI tests) | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, `event-rule-editor.test.tsx` |
| custom contains ANY keyword matches | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, `matcher.rs` tests |
| configured recovery prompt received | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `fixture-receipts.jsonl` in local runtime, `acceptance-plan.md` |
| conversation C triggers; D isolated | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, engine tests |
| same rule id in header/global entry | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, header tests |
| regex validation and side-effect-free preview | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, `event_rule` tests |
| max attempts/cooldown/reset logs | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, structured log tests |
| settle ordering and same-turn dedup | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `phase1a-review.md`, engine tests |
| separate-turn identical failure preserved | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `phase1a-review.md`, engine tests |
| priority/shadow/no fallback | PASS | PASS (preview evidence) | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, matcher/preview tests |
| specific persistent target/folder | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, target log receipt |
| rules/template/guard persistence | PASS | PASS | NOT_PROVEN (native UI surface unavailable) | `acceptance-plan.md`, migration/service tests |
| Scheduled regression | PASS (existing suite) | PASS | NOT_PROVEN (native UI surface unavailable) | `automations-page` tests, `acceptance-plan.md` |
| transport parity | PASS (Tauri/Web registration + TS wire types) | PASS | PASS (desktop command registration/compile) | `backend-report.md`, cargo checks |
| final frontendDist and release executable | PASS | n/a | PASS | `out/`, `src-tauri/target/release/codeg.exe` |

Allowed outcomes are `PASS`, `FAIL`, and `NOT_PROVEN`. A cell may be `n/a`
only where the evidence class does not apply.

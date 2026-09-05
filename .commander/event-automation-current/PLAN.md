# Phase 1 implementation plan
Base upstream/main: 1f86f62a1b0b29464800cccc869ebd7391fcdabe (0.30.2)
Old docs commit: 6c4087ae; migrated docs: 67808425. 31 modify/delete doc conflicts resolved by preserving approved full documents and missing OpenSpec metadata/config; no product code cherry-picked.
Workspace: F:\AI_PROJECTS\codeg-event-automation-current
Branch: feature/event-automation-current
1. Parallel latest-architecture review: backend runtime (Luna), UI/transport (Luna). Root dependencies, baseline, contracts and acceptance orchestration.
2. Backend Luna implements Phase1A using upstream APIs after recording delta, plus scope/validate/preview/log contract in separate logical slice. No Phase2/3.
3. Independent Luna review Phase1A with tests; only after passing start frontend implementation.
4. Frontend Luna implements shared editor and dual entry, consuming agreed wire contract; root integration verification.
5. Independent review Phase1B; fix findings.
6. Root actual Web/Desktop dev acceptance, isolated data, final one release build. Independent acceptance review.
7. Commit only relevant files, push explicit origin feature/event-automation-current. No PR/merge/upstream push/force push.
All evidence stored in .commander/event-automation-current/tasks and final report. NOT_PROVEN for unavailable evidence; never claim PASS from code/tests alone.

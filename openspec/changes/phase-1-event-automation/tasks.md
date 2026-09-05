# Tasks — 产品验收路线图，不是本轮 apply 授权

## 1. Phase 1A / 1B

- [ ] 1.1 核对 9d685f36 基础交付与差额，以子 change 测试和证据验证，不将历史勾选视为实机证明。
- [ ] 1.2 完成 event-automation-ui 契约和双入口，验证 design 八项 Phase 1 验收。
- [ ] 1.3 完成 retry 模板 UI 验收，验证修改关键词/prompt 实际生效及三次上限。
- [ ] 1.4 Desktop/Web 各记录 UI、消息和日志证据及 scheduled 回归后裁定 Phase 1 完成。

## 2. Phase 2

- [ ] 2.1 完成 agent-wake-scheduler，验证一次性 exit/timer/重启恢复，不将其设为 reviewer 硬依赖。

## 3. Phase 3

- [ ] 3.1 完成 existing-target resolver 和成功 lifecycle，验证跨 folder、离线、busy、deleted 和 parent/spawned 身份。
- [ ] 3.2 完成 reviewer-controlled-handoff，验证 continue/reroute/exit、轮次、重复、重启与停止竞争。
- [ ] 3.3 完成 spawn 和 Review target New/Existing UI，验证 Initial Prompt 仅新会话发送。
- [ ] 3.4 完成实验模板三个案例，记录第三轮 CONTINUE 被 guard 覆盖的日志。

## 4. Stop

本轮文档收口后停止，以上实施任务保持未完成。automation-extensions-* 不自动启动。

## 5. Current product implementation queue

- [x] 5.1 Port settled content/completion/failure semantics and multi-target execution on the current upstream base.
- [x] 5.2 Implement authorized send/read tools and the shared wake scheduler; verify persistence, restart recovery and one-shot idempotency.
- [x] 5.3 Deliver menu/editor/preview/log UX with native locale parity and real conversation isolation.
- [x] 5.4 Record CODE_PROVEN, TEST_PROVEN and RUNTIME_PROVEN separately; do not infer Desktop/Web runtime proof from static tests or OpenSpec validation. (Desktop release visual/restart evidence remains UNKNOWN_NOT_PROVEN; no release build was run by instruction.)

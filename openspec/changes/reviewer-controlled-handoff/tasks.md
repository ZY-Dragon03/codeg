## 1. Contracts and producers

- [ ] 1.1 接入 event-automation-spawn-agent 1.4 唯一 settled-success producer（可先于 spawn 实现），补 chain 归属消费，验证人工/旧/重复 turn 不重启链。
- [ ] 1.2 完成 action-target Phase 3 resolver，验证 source/parent/specific/spawned、跨 folder 及既有身份恢复。
- [ ] 1.3 定义 versioned decision、candidate scope 和 actor 验证，测试非法/越权/id 冲突及动态 B 目标。
- [ ] 1.4 增加受 gate 的 automation_decision/candidate query companion receiver，验证 Cursor/Codex/ACP 实际注入和双平台支持；失败者不可启用。
- [ ] 1.5 增加显式 strict-final-JSON adapter，验证全正文单对象、无多对象/围栏/旧 turn、与 tool 不混用；不支持的 session 显示原因。

## 2. Durable chain and guard

- [ ] 2.1 持久化 chain/round/decision/action/receipt 与冻结配置，验证每 request 单决定及重复完成 CAS。
- [ ] 2.2 实现 CONTINUE/REROUTE/EXIT 和 settled 后消费，验证 B 完成回 reviewer、下次 CONTINUE 指 B。
- [ ] 2.3 实现 max_iterations/max_chain_depth/stop/error precedence，验证第三轮 CONTINUE 被覆盖及 chain retry 继承计数。
- [ ] 2.4 实现 crash recovery 和 uncertain 停止，验证发送前/中/后重启不隐式重发、终态迟到事件不复活。
- [ ] 2.5 实现 reviewer/target busy、deleted、offline、无决定和失败退出，验证无隐式 spawn 或原 worker fallback。

## 3. Product integration

- [ ] 3.1 扩展同一 EventRuleEditor 的 Review target New/Existing、候选范围和 guards，验证条件显示和 existing 不重发 Initial Prompt。
- [ ] 3.2 接 chain 状态/stop/log，验证 requested decision 与 effective action/guard reason 同时可审计。
- [ ] 3.3 使用 Existing reviewer 跑最小闭环，再结合 event-automation-spawn-agent 跑 New reviewer，验证消息数与身份。
- [ ] 3.4 Desktop/Web 及支持的 Cursor/Codex/ACP 逐项记录实际 tool/JSON 能力与闭环证据；未验证标 UNKNOWN_NOT_PROVEN。

## 4. Product boundary confirmations

- [ ] 4.1 Keep the existing reviewer protocol as a later consumer of completion forwarding plus send/read tools; do not redesign Phase 1 UI.
- [ ] 4.2 Persist and recheck the allowed-target policy, exact iteration/depth semantics, fail-closed missing decisions and requested/effective overrides.

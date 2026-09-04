# Tasks

## 阶段一

- [x] 1.1 `conversation_ref` 解析：`source_conversation`、`specific_conversation`
- [x] 1.2 `execute_send_to_conversation(ref, prompt)`
- [x] 1.3 接入 `match_rules` 输出 → 执行器
- [x] 1.4 集成测试：mock turn_failed → 原会话收到消息

## 阶段一收口

- [x] 1.5 `send_to_conversation` 在 turn settle 后发送（`TurnComplete` 触发执行）

## 阶段三

- [ ] 2.1 接入 event-automation-spawn-agent 唯一实现的 launch envelope + AutomationConfig 执行器，验证新 conversation receipt
- [ ] 2.2 `parent_conversation`、`spawned_agent_conversation` 解析
- [ ] 2.3 接入 reviewer-controlled-handoff 的 chain action authorization，验证 depth/iteration 拦截；不另建计数器

## Phase 1B 差额（先于开放 existing selector）

- [ ] 3.1 从目标 DB 行解析真实 folder/agent/身份并重检 deleted/busy/offline，验证跨 folder 发送不沿用源 folder。
- [ ] 3.2 验证 source 与 specific 目标、scope 分离、无隐式 spawn；历史 [x] 不代表这些新增情况已验证。

## Phase 3 原身份恢复

- [ ] 4.1 复用 ACP resume 恢复既有 conversation，验证 external_id/agent_type/folder 一致；无法恢复时可见停止，无新 conversation。

# Tasks

## 阶段一

- [x] 1.1 `conversation_ref` 解析：`source_conversation`、`specific_conversation`
- [x] 1.2 `execute_send_to_conversation(ref, prompt)`
- [x] 1.3 接入 `match_rules` 输出 → 执行器
- [x] 1.4 集成测试：mock turn_failed → 原会话收到消息

## 阶段一收口

- [x] 1.5 `send_to_conversation` 在 turn settle 后发送（`TurnComplete` 触发执行）

## 阶段三

- [ ] 2.1 `execute_spawn_agent(AutomationConfig)`
- [ ] 2.2 `parent_conversation`、`spawned_agent_conversation` 解析
- [ ] 2.3 `max_chain_depth` 计数

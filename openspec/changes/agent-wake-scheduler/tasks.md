# Tasks

## Phase 1B Wake delivery

与 Phase 1B Registry 一起交付；不是 reviewer 的硬依赖。所有 Wake send 复用 action-target 的目标验证/日志，生命周期观察不得重复执行。

- [CODE_PROVEN] 1.1 `agent_wakes` 表 + CRUD
- [CODE_PROVEN/TEST_PROVEN] 1.2 订阅 terminal/ACP process exit → 按 identity 匹配 Wake → send_to_source
- [CODE_PROVEN/TEST_PROVEN] 1.3 持久化 timer + `timer_fired` 调度
- [CODE_PROVEN/TEST_PROVEN] 1.4 MCP：`wake_on_process_exit`, `wake_after`, `wake_at`
- [ ] 1.5 验收：python 脚本 exit + 30min timer

## 后续（非阶段二必须）

- [ ] 2.1 WakeBundle（exit 与 timeout 互斥）
- [ ] 2.2 Wake 列表 UI / 取消 API

- [CODE_PROVEN/TEST_PROVEN] 1.6 Add list/cancel handlers, authenticated current-context policy and stable terminal/process identity validation.
- [CODE_PROVEN/TEST_PROVEN] 1.7 Add restart recovery, CAS one-shot consumption, wake_id receipts and target-unavailable logs; use the shared action executor.

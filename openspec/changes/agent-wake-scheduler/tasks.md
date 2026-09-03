# Tasks

## 阶段二

- [ ] 1.1 `agent_wakes` 表 + CRUD
- [ ] 1.2 订阅 `terminal://exit` → 匹配 Wake → send_to_source
- [ ] 1.3 持久化 timer + `timer_fired` 调度
- [ ] 1.4 MCP：`wake_on_process_exit`, `wake_after`, `wake_at`
- [ ] 1.5 验收：python 脚本 exit + 30min timer

## 后续（非阶段二必须）

- [ ] 2.1 WakeBundle（exit 与 timeout 互斥）
- [ ] 2.2 Wake 列表 UI / 取消 API

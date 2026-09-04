# Tasks

- [x] 1.1 内置模板 migration（默认 disabled）
- [ ] 1.2 关键词/regex 编辑器 UI（阶段一 deferred，无 UI）
- [x] 1.3 per-conversation attempt + cooldown 状态（内存或 DB）
- [x] 1.4 超限 timeline 事件（`event_rule_log` `skipped_max_attempts`）
- [x] 1.5 E2E：模拟 connection 错误 → 最多 3 次「继续」

## 2. 阶段一收口

- [x] 2.1 `max_attempts` 限制连续失败链；成功 `TurnComplete(end_turn)` 后重置
- [x] 2.2 空闲 30 分钟后自动开启新 attempt 链（`ATTEMPT_CHAIN_IDLE_RESET`）
- [x] 2.3 规则动作在 `TurnComplete` 后执行（`turn_in_flight` 已 settle）

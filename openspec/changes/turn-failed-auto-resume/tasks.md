# Tasks

- [x] 1.1 内置模板 migration（默认 disabled）
- [ ] 1.2 Phase 1B 必需：由 event-automation-ui 交付 keywords/ANY/ALL/regex/error_kind/prompt/guards/模板编辑双入口，验证 UI 编辑后真实发送行为改变；不得 deferred。
- [x] 1.3 per-conversation attempt + cooldown 状态（内存或 DB）
- [x] 1.4 超限 timeline 事件（`event_rule_log` `skipped_max_attempts`）
- [x] 1.5 E2E：模拟 connection 错误 → 最多 3 次「继续」

## 2. 阶段一收口

- [x] 2.1 `max_attempts` 限制连续失败链；成功 `TurnComplete(end_turn)` 后重置
- [x] 2.2 空闲 30 分钟后自动开启新 attempt 链（`ATTEMPT_CHAIN_IDLE_RESET`）
- [x] 2.3 规则动作在 `TurnComplete` 后执行（`turn_in_flight` 已 settle）

## 3. 产品验收差额

历史 [x] 表示 9d685f36 已登记的后端交付/测试，不代表本轮重跑或 Desktop/Web 实机证明。

- [ ] 3.1 配合 event-automation-ui 验证模板修改/重启保留、当前会话隔离、三次上限和 cooldown，记录 Desktop/Web 消息与日志证据。

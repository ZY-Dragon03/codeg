# Tasks

## 1. 事件总线

- [ ] 1.1 定义 `LifecycleEvent` 与 `EventBus`（或复用现有 broadcaster）
- [ ] 1.2 在 ACP turn failed/completed、delegation_completed、automation settle、task review 接入发布
- [ ] 1.3 单元测试：各事件 payload 字段完整

## 2. 规则引擎

- [ ] 2.1 DB 模型 `lifecycle_rules`（priority、scope、when、then、enabled）
- [ ] 2.2 条件求值：`error_kind`、`text_contains`、`regex`、`stop_reason`
- [ ] 2.3 动作执行器：`send_message`、`retry_turn`、`delegate_to_agent`、`enqueue_task`
- [ ] 2.4 护栏：max_attempts、cooldown_ms、max_rule_chain_depth
- [ ] 2.5 集成 `delegation-target-policy`（委派动作前校验）

## 3. 内置模板

- [ ] 3.1 模板：TLS/RetriableError → 发送「继续」（默认关闭）
- [ ] 3.2 模板：turn_completed → delegate 审计 agent（默认关闭，需用户指定 reviewer）

## 4. UI

- [ ] 4.1 设置页「生命周期规则」列表与编辑器
- [ ] 4.2 规则测试台（样本输出预览命中）
- [ ] 4.3 时间线展示规则执行记录

## 5. 验证

- [ ] 5.1 模拟 connection 错误 → 自动「继续」且不超过 max_attempts
- [ ] 5.2 模拟正常结束 → 审计 agent 被委派且内容含 summary
- [ ] 5.3 规则关闭时零副作用（与现有人工 Retry 行为一致）

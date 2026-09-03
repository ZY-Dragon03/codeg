# Tasks

## 1. 事件模型

- [ ] 1.1 `LifecycleEvent` + `EventKind` 定义
- [ ] 1.2 `turn_failed` 在 ACP 错误分类点发布

## 2. 规则存储

- [ ] 2.1 `event_rules` 表 + CRUD API
- [ ] 2.2 Rule JSON schema 校验（trigger/condition/action/guard）

## 3. 匹配引擎

- [ ] 3.1 `match_rules(event) -> Vec<MatchedRule>`
- [ ] 3.2 contains / regex / error_kind 求值
- [ ] 3.3 单元测试：TLS 样本命中/不命中

## 4. 阶段二+事件占位

- [ ] 4.1 文档列出 `turn_completed`、`terminal_exited`、`timer_fired` 接入点（本 change 可不实现发布）

# Tasks

## 1. 事件模型

- [x] 1.1 `LifecycleEvent` + `EventKind` 定义
- [x] 1.2 `turn_failed` 在 ACP 错误分类点发布

## 2. 规则存储

- [x] 2.1 `event_rules` 表 + CRUD API
- [x] 2.2 Rule JSON schema 校验（trigger/condition/action/guard）

## 3. 匹配引擎

- [x] 3.1 `match_rules(event) -> Vec<MatchedRule>`
- [x] 3.2 contains / regex / error_kind 求值
- [x] 3.3 单元测试：TLS 样本命中/不命中

## 4. 阶段二+事件占位

- [x] 4.1 文档列出 `turn_completed`、`terminal_exited`、`timer_fired` 接入点（本 change 可不实现发布）

## 5. 阶段一收口

- [x] 5.1 CRUD 后 `EventRulesEngine.reload_rules()` 热重载
- [x] 5.2 `SessionFailure` + `AcpEvent::Error` 合并缓冲，在 `TurnComplete` 后单次执行
- [x] 5.3 `conversation + turn_session_id + failure_record_id + fingerprint` 去重（30s TTL）

## 产品边界

上述 [x] 保留 9d685f36 的历史交付记录，本轮未重跑。scope/输入校验/稳定排序/preview/log UI 差额属于 event-automation-ui；成功事件 producer 属 event-automation-spawn-agent 1.4，review chain 关联消费属 reviewer-controlled-handoff。基础任务完成不能宣布 Phase 1 产品完成。

## 6. Current upstream port（2026-09-05 新授权）

基线 upstream/main 1f86f62a1b0b29464800cccc869ebd7391fcdabe，0.30.2。上面的历史勾选不表示新基线已移植；本节为本轮执行队列。

- [x] 6.1 对比 ACP lifecycle/connection/manager、identity、delegation、Automations、migrations、app_state 与双模式注册，记录实际复用和差异，禁止整体移入旧实现。
- [x] 6.2 将 turn_failed、持久化 CRUD/matcher/send/retry/dedup/settle/hot reload 适配最新接口；target identity 从 DB 解析，验证源码和针对性 Rust 测试。
- [x] 6.3 通过独立 Phase 1A review，验证未机械覆盖 upstream、时序和跨 folder 身份；所有发现修复后记录复核。
- [x] 6.4 Desktop/Web 注册及迁移与原有 schema 共存，验证两模式编译及 runtime 迁移。

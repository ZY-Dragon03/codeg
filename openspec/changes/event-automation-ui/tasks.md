## 1. Backend contract completion

- [x] 1.1 补 scope 和旧记录 global 默认，验证 C/D 隔离、folder/agent scope 和迁移 round-trip。
- [x] 1.2 补权威 validate/preview，验证 ANY/ALL、Rust regex、空值、无 attempt/send 副作用。
- [x] 1.3 固定 priority/id first-match，验证 guard 不落到第二规则及预览遮蔽说明。
- [x] 1.4 补分页 log read 和版本化 detail，验证旧日志兼容及源/目标/prompt/guard 可读。
- [x] 1.5 完成 action-target 1B 目标/folder 差额后开放 selector，验证跨 folder、deleted/busy/offline。

## 2. Shared editor and entries

- [x] 2.1 补 TS wire types/CRUD/preview/log transport，验证 Desktop/Web 参数结果一致。
- [x] 2.2 构建 EventRuleEditor、selector、模板操作，验证字段 round-trip 与模板修改启停持久化。
- [x] 2.3 AutomationsPage 加 Scheduled/Event tabs，验证 scheduled 回归和同一 event rule id 读写。
- [x] 2.4 ConversationDetailHeader 加独立按钮、scope 预填、draft 禁用，验证同编辑器且不注入 composer。
- [x] 2.5 加预览/日志和 CRUD/focus/reconnect refetch，验证跨入口更新及可见错误。
- [x] 2.6 补各语言文案、窄屏和键盘可访问性，验证独立入口可发现。

## 3. Product acceptance

- [x] 3.1 运行有意义的 UI/contract/matcher 测试及相关 lint，记录命令结果。
- [ ] 3.2 Desktop/Web 各完成无 API 辅助的创建编辑启停，真实触发自定义 prompt、scope 隔离、三次上限/冷却并保留证据（Web 已完成；Desktop visual interaction `NOT_PROVEN`）。
- [ ] 3.3 重启验证模板配置、scheduled 回归；按 phase-1 design 八项裁定，不用 mock 代替实机（Web 已完成；Desktop restart `NOT_PROVEN`）。

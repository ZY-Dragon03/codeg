# Tasks

## 1. 数据模型

- [ ] 1.1 `DelegationPolicy` 结构：allow/deny/tier rules
- [ ] 1.2 agent registry 增加 `delegation_tier` 与标签
- [ ] 1.3 持久化到 `delegation` 配置命名空间

## 2. 策略引擎

- [ ] 2.1 `PolicyEngine::can_delegate(from, to)`
- [ ] 2.2 MCP `delegate_to_agent` 与 Tauri/Web 委派命令接入校验
- [ ] 2.3 错误码 `DELEGATION_POLICY_DENIED` 与可读消息

## 3. UI

- [ ] 3.1 设置页「委派策略」编辑（白/黑名单、等级规则）
- [ ] 3.2 内置工人保守默认（Codex → cdx-explore 等）
- [ ] 3.3 与 preset 创建联动写入推荐策略

## 4. 验证

- [ ] 4.1 白名单外目标被拒绝且不启动进程
- [ ] 4.2 空策略向后兼容（允许所有）
- [ ] 4.3 等级约束：高等级目标不可被低等级委派方调用

# Tasks

## 1. Backend Settings Schema

- [ ] 1.1 定义 schema 结构（字段类型、launch_mapping、visibility_when）
- [ ] 1.2 Cursor schema：permission_mode、model、effort、fast、network
- [ ] 1.3 Codex schema：等价权限与模型字段

## 2. 存储与解析

- [ ] 2.1 统一 `agent_settings` 与 `delegation.agent_defaults` 键空间
- [ ] 2.2 `build_launch_args(agent, resolved_settings)` 统一 launch 注入
- [ ] 2.3 删除 connection 对特定 custom slug 的硬编码

## 3. UI

- [ ] 3.1 抽取 `AgentSettingsForm`，内置与 `custom:*` 共用
- [ ] 3.2 权限变更高风险确认对话框
- [ ] 3.3 schema 驱动 Effort 显示/隐藏（替代 `cursor-model-options` hardcode）

## 4. 验证

- [ ] 4.1 自定义 Cursor 工人设 Run Everything 后委派无连环权限弹窗
- [ ] 4.2 委派默认 model 与工人设置一致解析

# Tasks

## 1. Registry

- [ ] 1.1 统一 `AgentBackendCatalog` 与内置工人 registry 数据源
- [ ] 1.2 定义 `preset_id`、`launch_template`、`suggested_delegation_tier` 字段
- [ ] 1.3 `GET /api/agent-presets` 端点

## 2. 创建流程

- [ ] 2.1 设置页「添加智能体」向导：预设选择 → 定制 → 保存
- [ ] 2.2 DB migration：`preset_id` + `overrides` 列
- [ ] 2.3 高级「完全自定义」入口保留

## 3. 验证

- [ ] 3.1 从 Cursor/Codex 预设创建后 launch 配方正确
- [ ] 3.2 内置 registry 更新后预设同步（无实例级 override 时）

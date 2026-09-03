## Purpose

让用户从 Cursor、Codex 等内置后端预设创建自定义智能体，而不是从零手填 launch 配方。

## ADDED Requirements

### Requirement: 系统提供后端预设目录

系统 MUST 暴露只读的后端预设目录，每条预设对应一个官方支持的 ACP 后端及其默认 launch 模板与元数据。

#### Scenario: 列出 Cursor 预设

- **WHEN** 用户打开「添加自定义智能体」
- **THEN** 系统 MUST 展示基于 Cursor 后端的预设选项及简要说明

### Requirement: 从预设创建自定义智能体

系统 MUST 支持用户选择预设后仅需填写显示名称与 slug 即可创建智能体实例。

#### Scenario: 从 Codex 预设创建

- **WHEN** 用户选择 Codex 预设并填写 slug `my-codex`
- **THEN** 系统 MUST 创建 `custom:my-codex` 且 launch 配方与 Codex 预设一致
- **THEN** 系统 MUST 记录 `preset_id` 以便后续升级

### Requirement: 预设与内置工人定义一致

系统 MUST 从同一 registry 源生成内置工人与预设目录，避免重复定义导致漂移。

#### Scenario: 内置 Cursor 工人更新后预设同步

- **WHEN** 内置 Cursor 工人的 launch 模板在 registry 中更新
- **THEN** 未自定义 launch 覆盖的 Cursor 预设 MUST 反映同一模板

### Requirement: 保留高级完全自定义入口

系统 MUST 提供非默认的高级路径，允许完全自定义 launch，但不 MUST 作为默认创建流程。

#### Scenario: 高级自定义

- **WHEN** 用户选择「高级：完全自定义」
- **THEN** 系统 MUST 允许手填 launch 参数且 MUST NOT 强制绑定预设

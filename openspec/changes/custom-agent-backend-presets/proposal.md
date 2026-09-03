# 从内置后端预设创建自定义智能体

## Why

当前添加自定义智能体基本是「手填名字 + 选底层二进制」，无法从已有的 Cursor、Codex 等内置工人**克隆**一套成熟配置。用户不得不重复造轮子，且新智能体缺少与内置相同的默认能力描述、MCP/Skill 模板与设置骨架。

## What Changes

- 提供**后端预设目录**（built-in catalog）：每条预设对应一个官方支持的 ACP 后端（如 `cursor`、`codex`）及其默认 launch 配方、能力标签、推荐用途。
- 「添加自定义智能体」流程改为：**先选预设 → 再定制**（名称、slug、可选覆盖项），而非从零手填。
- 从预设创建时复制：launch 命令模板、默认权限档位占位、探测所需的 backend id、委派可用的 subagent 类型提示。
- 预设与内置工人共享同一 backend 定义源（single source of truth），避免内置更新后预设漂移。
- 保留「高级：完全自定义」入口，但非默认路径。

## Capabilities

### New Capabilities

- `custom-agent-presets`: 自定义智能体从内置后端预设实例化的创建流程

### Modified Capabilities

- （无）

## Impact

- 自定义智能体 CRUD API 与 DB 模型（`custom_agents` 或等价表）
- 设置页「智能体管理」创建向导 UI
- `src-tauri` 内置 agent registry / catalog
- 依赖 `custom-agent-settings-parity` 才能在创建后展示完整设置

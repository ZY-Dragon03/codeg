# 自定义智能体与内置后端设置对等

## Why

基于 Cursor 或 Codex 的自定义智能体（如 `cg-explore`）在设置里只有 Skill / MCP 开关，缺少权限等级、Run Everything / Full Access、`--force`、模型/Effort/Fast 等与内置工人相同的项。委派出去的工人因此反复弹出权限确认，且无法配置与主会话对等的自动化级别。自定义智能体本质上是**后端实例**，其可调整面应与所基于的后端一致。

## What Changes

- 定义 **Backend Settings Schema**：每种 ACP 后端声明其可编辑字段（权限模式、模型族、effort、网络、auto-approve 等）及 UI 组件映射。
- 自定义智能体绑定 `backend_id` 后，设置页**动态渲染**与该后端相同的表单区块（与内置工人共用组件与校验）。
- 权限相关选项（Run Everything、Yolo、full access、`--force` 等等价物）必须可配置并**在 spawn 时注入** launch 参数或 structured config，而非仅主会话有效。
- 委派默认（`delegation.agent_defaults`）与工人面板设置使用同一 schema 键空间，避免「委派里写了 model、工人里改不了权限」的分裂。
- 内置 Cursor 工人与 `custom:cursor-*` 自定义工人走同一设置管道。

## Capabilities

### New Capabilities

- `custom-agent-backend-settings`: 自定义智能体继承并编辑其后端完整设置 schema

### Modified Capabilities

- `cursor-worker-model`: 模型钉死与 Effort 规则改为 backend schema 的一部分，而非仅内置/委派路径

## Impact

- `src/components/settings/` — 智能体默认、自定义智能体编辑
- `src-tauri/src/acp/connection.rs` — launch 参数与 structured config 注入统一化
- `delegation.agent_defaults` 与 per-agent settings 存储结构
- 与 `session-config-replay-order`、`cursor-network-transport-setting` 共用 schema 定义

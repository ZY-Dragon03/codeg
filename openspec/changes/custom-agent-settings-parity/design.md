## Context

见 `proposal.md`。自定义 `custom:cg-explore` 等仅暴露 skill/MCP；权限、`--force`、模型覆盖在委派默认与 launch 路径分裂。

## Goals / Non-Goals

**Goals:**

- `BackendSettingsSchema`：字段定义（type、enum、launch_mapping、session_mapping、visibility_when）
- 设置页对 `custom:*` 与内置同 backend 渲染同一 `AgentSettingsForm` 组件
- Launch 注入统一函数：`build_launch_args(agent, resolved_settings)`

**Non-Goals:**

- 不改变各 CLI 本身支持的选项集合（只暴露已有能力）
- 不在此 change 实现委派白名单（见 `delegation-target-policy`）

## Decisions

### 1. 权限 / Run Everything

**决定**：schema 字段 `permission_mode: enum { default, full_access, run_everything, ... }` 映射到 cursor-agent `--force` 或 structured config 等价项；Codex 映射到其 yolo/approval 标志。

### 2. 存储模型

**决定**：`agent_settings` 表或 JSON 列，键与 schema id 一致；`delegation.agent_defaults` 存子集引用同一键空间（`defaults` 可 inherit 工人设置或 override）。

### 3. UI 探测

**决定**：动态选项（model 列表）仍来自探测快照，但 **过滤规则** 来自 schema + 当前 model（Effort 隐藏等），非组件内 hardcode。

### 4. 与 session-config-replay-order

**决定**：保存的设置经 replayer 应用；launch 阶段字段在 spawn 前解析。

## Risks / Trade-offs

- [CLI 无等价 full access 标志] → schema 标记 `unsupported` 并灰显说明
- [安全] → `run_everything` 变更需确认对话框

## Migration Plan

1. 为 Cursor/Codex 定义首版 schema 并接 UI
2. 迁移 `delegation.agent_defaults` 中已有键到统一命名
3. 删除仅针对 `custom:cursor-*` 的 connection 硬编码注入

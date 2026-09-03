## Context

见 `proposal.md`。自定义智能体数据模型已有 backend 关联，但创建流程是手填，与内置 registry 重复定义。

## Goals / Non-Goals

**Goals:**

- `AgentBackendCatalog`：内置 `cursor`、`codex`、`claude`… 条目，含 `preset_id`、`launch_template`、`default_tags`、`recommended_delegation_tier`
- 创建向导：`preset → customize → persist`
- DB 存 `preset_id` + `overrides` JSON，便于升级时 rebase

**Non-Goals:**

- 不支持用户上传任意 launch 二进制作为「预设」（仍走高级自定义）
- 不在本 change 实现完整设置表单（依赖 settings-parity）

## Decisions

### 1. 单一 registry 源

**决定**：`src-tauri` 内置工人列表与预设目录同一 Rust 结构生成；前端只读 API `GET /api/agent-presets`。

### 2. 克隆语义

**决定**：「从 Cursor 创建」= 新 slug + 复制 cursor backend 的默认 schema 默认值 + 空白 display name；不复制另一自定义智能体的实例。

### 3. 与委派策略

**决定**：预设可带 `suggested_delegation_policy` 种子，用户可在 `delegation-target-policy` UI 修改。

## Risks / Trade-offs

- [预设过多难选] → 分组（探索 / 实现 / 审查）+ 搜索
- [内置工人改名] → `preset_id` 稳定，display 可变

## Migration Plan

现有自定义智能体：`preset_id` 反推为 `custom` 或对应 backend；一次性 migration。

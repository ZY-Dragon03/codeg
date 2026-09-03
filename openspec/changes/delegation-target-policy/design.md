## Context

见 `proposal.md`。委派经 MCP `delegate_to_agent` 或内置协同，无目标过滤。

## Goals / Non-Goals

**Goals:**

- `DelegationPolicy`：`allow_list`、`deny_list`、`max_target_tier`、`per_delegator_overrides`
- 每个 agent 声明 `delegation_tier: u8`（或命名等级：restricted / standard / elevated / full）
- 派发前 `PolicyEngine::can_delegate(from, to) -> Result`

**Non-Goals:**

- 不替代 OS 级沙箱
- 不实现跨机器委派策略同步（单机 settings 先行）

## Decisions

### 1. 默认策略

**决定**：内置工人带保守默认（如 Codex → 仅 `cdx-explore` 在白名单）；用户可放宽。自定义智能体从 preset 继承 `suggested_delegation_policy`。

### 2. 匹配规则

**决定**：目标匹配顺序：`deny` 优先 → `allow`（若 allow 非空则必须命中）→ `tier` 检查。支持 slug 精确、前缀 `custom:`、标签 `role:explore`。

### 3. 失败语义

**决定**：拒绝时 MCP 返回结构化错误 `DELEGATION_POLICY_DENIED`，含原因与建议目标；不启动子进程。

### 4. UI

**决定**：设置页「委派策略」独立节，与「启用委托」开关并列；展示当前委派方有效策略预览。

## Risks / Trade-offs

- [策略过严用户困惑] → 首次拒绝时内联链接到策略编辑
- [tier 语义主观] → 文档 + 内置预设推荐值

## Migration Plan

默认策略向后兼容：空 policy = 允许所有（与现行为一致），设置页提示用户收紧。

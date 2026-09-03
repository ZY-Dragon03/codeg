## Context

见 `proposal.md`。本地分支 `fix/pin-cursor-acp-launch-model` 相对官方 v0.30.0 的临时修复。

## Goals / Non-Goals

**Goals:**

- 维护 **Fork 差异表 → OpenSpec change** 映射
- 定义每条 fork 提交的 **删除条件** 与 **官方验收场景**

**Non-Goals:**

- 不在此 change 合并代码或发布 Dev 包

## Decisions

### Fork 差异映射表

| 本地提交 / 行为 | 问题本质 | 正式 change | 删除 fork 条件 |
|----------------|----------|-------------|----------------|
| `ensure_cursor_http1_for_launch` | 网络设置应是用户配置 | `cursor-network-transport-setting` | UI 可配且 spawn 不偷偷写 cli-config |
| `cursor_launch_model_id` + inject `--model` | launch 阶段 model 与 schema 分裂 | `custom-agent-settings-parity` + `session-config-replay-order` | 自定义 Cursor 工人与内置共用 launch 构建器 |
| `cursor-model-options.ts` Effort 过滤 | UI 应读 schema 而非 hardcode | `custom-agent-settings-parity` | 表单由 schema `visibility_when` 驱动 |
| `order_preferred_config_values`（未 cherry-pick） | 配置回放顺序 | `session-config-replay-order` | 通用 replayer 上线 |
| `scripts/swap-live-codeg.*` | Dev 双轨工具 | 保留为开发脚本，非产品债 | 无 |

### 验收场景（官方包）

1. `cg-explore` 委派默认 `gpt-5.6-luna` + `effort: low` → 首轮对话为 Luna，非 Grok xhigh
2. 自定义 Cursor 工人可设 Run Everything，委派不再连环弹权限
3. HTTP/1.1 在设置中开启后 TLS 握手失败率可接受（用户自测）
4. Codex 委派策略限制仅 `cdx-explore` 时，派给其他工人被拒绝且提示清晰

## Risks / Trade-offs

- [长期双轨 Dev/官方] → 明确 Dev 仅自测，不替代官方更新渠道

## Migration Plan

用户暂不接债：保持官方 v0.30.0 日常用；实现上述 change 后弃用 fork 分支。

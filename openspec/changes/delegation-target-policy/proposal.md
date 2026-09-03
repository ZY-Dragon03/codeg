# 委派目标策略（白名单 / 黑名单 / 权限等级）

## Why

「启用委托」目前仅是总开关，无法限制主智能体能派给谁。例如 Codex 应只能 delegate 给 `cdx-explore` 等低风险工人，或只能派给**同级及以下**权限的智能体，而不能派给更高权限的 Full Access 工人。缺少策略层导致权限弹窗频发、越权委派和运维不可控。

## What Changes

- 引入 **Delegation Policy** 模型，独立于单个 MCP 工具开关：
  - **目标白名单 / 黑名单**（按 agent slug、backend 族、标签匹配）
  - **权限等级（tier）**：每个智能体声明 `delegation_tier`；委派方只能派给 `tier <= self` 的目标（可配置为同级或更严）
  - **按委派方差异化**：例如 `codex` 默认白名单 `[cdx-explore, cdx-general]`，Cursor 主会话另一套默认
- 设置页提供策略编辑 UI（列表、等级滑块、预设模板）。
- `delegate_to_agent` / MCP 委派入口在派发前**强制校验**策略，拒绝时返回明确错误而非启动后再弹权限。
- 策略持久化在 `delegation` 配置命名空间，支持导入/导出。
- 与 `custom-agent-backend-presets` 联动：从预设创建时继承推荐委派策略。

## Capabilities

### New Capabilities

- `delegation-target-policy`: 委派目标白黑名单与权限等级约束

### Modified Capabilities

- （无）

## Impact

- `codeg-mcp` 委派工具与 `src-tauri` 委派命令
- 设置页「多智能体协同 / 委派」区块
- 智能体 registry 增加 `delegation_tier` 与标签
- 依赖 `custom-agent-settings-parity` 提供一致的权限等级语义

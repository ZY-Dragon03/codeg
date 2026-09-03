# 会话配置按依赖顺序回放

## Why

委派默认、面板覆盖、探测快照等多来源的会话选项，目前在回放时按 `BTreeMap` 字母序应用，导致 `effort` 先于 `model` 等错误顺序。结果是工人实际使用的模型/档位与用户保存的委派默认不一致（例如 Luna + Low 落成 Grok + xhigh）。这是跨所有 ACP 智能体家族的通用问题，不应为 Cursor 单独打补丁。

## What Changes

- 引入**配置回放编排层**：按智能体后端的**选项依赖图**（schema）确定应用顺序，而非 map 迭代顺序。
- 为每种后端（Cursor、Codex、Claude 等）声明选项键的优先级与互斥/依赖关系（例如必须先 `model` 再 `effort`/`fast`）。
- 回放前做**一致性校验**：若目标模型不支持某选项（Composer 无 Effort），跳过或降级并记录可观测事件，而不是静默套用探测残留值。
- 统一委派默认、设置页保存、会话重连三条路径，全部走同一编排器。
- 移除或废弃各处的「按字母序 / 按特殊分支」零散逻辑。

## Capabilities

### New Capabilities

- `acp-session-config-replay`: ACP 会话偏好评项的依赖顺序回放与校验

### Modified Capabilities

- `cursor-worker-model`: 启动钉模型与 Effort 隐藏改为依赖通用回放编排，而非独立分支

## Impact

- `src-tauri/src/acp/connection.rs` — `apply_preferred_session_options` 及同类路径
- 各 parser / backend adapter 的选项 schema 定义
- 委派默认 UI 保存与后端回放契约
- 需与 `custom-agent-settings-parity` 对齐选项 schema 来源

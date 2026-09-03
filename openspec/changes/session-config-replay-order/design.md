## Context

见 `proposal.md`。当前 `apply_preferred_session_options` 等对 `BTreeMap<String, Value>` 直接迭代；Cursor 另有 Grok 专用「先 model 后 effort」分支。上游 `order_preferred_config_values`（`bddf6656`）仍是键列表硬编码，未形成可扩展机制。

## Goals / Non-Goals

**Goals:**

- 单一 `SessionConfigReplayer`（名称可调整）服务所有 ACP 后端
- 每个后端注册 `OptionSchema`：`keys`、`apply_order`、`depends_on`、`incompatible_with`
- 回放前 `normalize`：剔除与当前 model 族冲突的键
- 可观测：回放顺序与跳过项写入 debug 日志 / 可选 UI 诊断

**Non-Goals:**

- 不重写各 CLI 的探测协议本身
- 不在本 change 内实现委派策略或自定义智能体 UI

## Decisions

### 1. Schema 存放位置

**决定**：Rust 侧 `acp::config_schema` 模块，每后端一个 `static OptionSchema`；前端设置页通过 API 拉取同一 schema 做动态表单（与 `custom-agent-settings-parity` 共用）。

**备选**：仅 JSON 配置文件 — 拒绝，类型安全与编译期校验更重要。

### 2. 回放算法

**决定**：对 `depends_on` 做拓扑排序；同层键按 schema 声明的 `tie_breaker`（显式序号，非字母序）。缺失依赖的键延后或失败并 surface 错误。

**备选**：继续 per-backend `if cursor { ... }` — 拒绝，不可维护。

### 3. 与 launch 参数的关系

**决定**：`model` 等必须在 spawn 前确定的键走 **LaunchPhase**；仅会话内有效的键走 **SessionPhase**。编排器分两阶段调用，避免「会话里改 model 赢不过出厂」类问题仍靠 connection 特殊逻辑。

### 4. 迁移 `bddf6656`

**决定**：吸收其键序思想进 Cursor schema 的 `apply_order`，不单独 cherry-pick 函数。

## Risks / Trade-offs

- [Schema 与真实 CLI 行为漂移] → 探测快照 + 集成测试夹具，每个后端至少一条回放顺序测试
- [性能] → 拓扑排序键数量极小，可忽略
- [与 fork 重复] → 实现本 change 后删除 connection 内零散顺序分支

## Migration Plan

1. 引入 schema + replayer，Cursor/Codex 先接入
2. 双写验证：新旧路径并行比对日志
3. 切换默认路径，删除 BTreeMap 直接迭代与 Grok 特殊分支
4. 归档 `pin-cursor-acp-launch-model` 中仅针对顺序的 patch 说明

## Open Questions

- Claude/OpenCode 等后端的 `apply_order` 是否需运行时从探测响应学习？初版可静态声明。

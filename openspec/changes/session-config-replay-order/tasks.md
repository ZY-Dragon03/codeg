# Tasks

## 1. Schema 与回放核心

- [ ] 1.1 新增 `acp::config_schema` 模块，定义 `OptionSchema`、`apply_order`、`depends_on`
- [ ] 1.2 实现 `SessionConfigReplayer`（拓扑排序 + Launch/Session 两阶段）
- [ ] 1.3 为 Cursor、Codex 注册首版 schema（含 model/effort/fast 顺序）
- [ ] 1.4 单元测试：键序、Composer 跳过 Effort、依赖失败路径

## 2. 接入现有路径

- [ ] 2.1 `apply_preferred_session_options` 改为调用 replayer
- [ ] 2.2 launch 阶段 model 解析并入 replayer LaunchPhase
- [ ] 2.3 删除 BTreeMap 直接迭代与 Grok 专用顺序分支

## 3. 前端与 API

- [ ] 3.1 暴露 schema 只读 API 供设置页使用（与 settings-parity 协调）
- [ ] 3.2 可选：委派诊断日志展示回放顺序

## 4. 验证

- [ ] 4.1 集成测试：`cg-explore` 委派默认 Luna + Low 首轮一致
- [ ] 4.2 回归：Composer 无 Effort、Codex 路径不受影响

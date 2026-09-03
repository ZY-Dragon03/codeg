# Tasks

> 纯规划移交，无实现任务。实现工作分布在下列 change 中。

## 文档

- [x] D.1 维护 fork 差异 → OpenSpec 映射表（见 `design.md`）
- [x] D.2 定义官方包验收场景清单（见 `design.md`）

## 待上游/其他 change 完成后

- [ ] D.3 验证官方 v0.30.x+ 满足验收场景后归档本地分支 `fix/pin-cursor-acp-launch-model`
- [ ] D.4 从日常开发流程移除对 `swap-live-codeg` fork 包的依赖（Dev 脚本可保留）

## 依赖关系（建议实施顺序）

1. `session-config-replay-order`
2. `custom-agent-settings-parity` + `cursor-network-transport-setting`（可并行）
3. `custom-agent-backend-presets`
4. `delegation-target-policy`
5. 本 change 验收归档

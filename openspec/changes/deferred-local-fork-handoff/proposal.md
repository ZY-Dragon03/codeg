# 本地 fork 技术债移交与上游归并路径

## Why

为验证 Cursor 委派与网络问题，本地分支 `fix/pin-cursor-acp-launch-model` 积累了若干**补丁式**提交（强制 HTTP/1.1、launch 时写 `--model`/`--force`、前端 Effort 过滤等）。维护者明确表示不愿长期背负此债。需要一份移交清单：每项 patch 对应哪个正式 OpenSpec change、上游应如何实现、本地 fork 何时可删除。

## What Changes

- 记录本地 fork 相对官方 v0.30.0 的**差异清单**与**弃用条件**。
- 将每项差异映射到本仓库活跃 OpenSpec change（非「再打一个 patch」）。
- 明确**不纳入**长期维护的临时手段（启动侧写 cli-config、仅 connection 层特殊分支）。
- 提供验证清单：上游合并后如何用官方包复现用户场景（`cg-explore` + Luna + Low、无权限连环弹窗等）。
- 本 change **不产生运行时行为变更**；纯规划与移交文档。

## Capabilities

### New Capabilities

- （无 — 文档与路线图）

### Modified Capabilities

- （无）

## Impact

- 文档：`openspec/changes/deferred-local-fork-handoff/`
- 指导后续是否 cherry-pick `bddf6656`（`order_preferred_config_values`）并入 `session-config-replay-order` 而非单独维护
- 分支 `fix/pin-cursor-acp-launch-model` 生命周期

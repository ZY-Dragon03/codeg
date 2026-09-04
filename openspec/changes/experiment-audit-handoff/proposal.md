# 实验审计模板与闭环验收

## Why

实验 Agent 完成后应接受审计，由 reviewer 决定补实验、改派既有 worker 或结束。固定 reviewer completed -> 原 worker resume 无法表达达标退出和动态交棒。

## What Changes

- 以 reviewer-controlled-handoff 为唯一通用闭环；本 change 只负责实验审计模板、上下文和产品例子。
- Review target 可新建或使用已有 reviewer；新建用 AutomationConfig Initial Prompt，已有仅发本轮任务和上下文。
- 五问审计清单（设计、泄漏、指标、是否追加、后续任务）生成明确 CONTINUE/REROUTE/EXIT；不得用 PASS 自然语言解析代替协议。
- 模板可编辑、默认关闭，max_iterations=3/max_chain_depth=6；平台护栏优先，Reviewer 不能覆盖。
- 验收 E70 补 ablation 后退出、A->B 改派、第三轮强制退出。

## Capabilities

### New Capabilities

- `experiment-audit-handoff`: 基于通用 reviewer 决策协议的实验审计模板与闭环体验。

### Modified Capabilities

无；本 change 未归档，直接修订原新增契约。

## Impact

依赖 reviewer-controlled-handoff、action-target-spawn-resume；New reviewer 路径依赖 event-automation-spawn-agent。复用 EventRuleEditor/scope 和日志，无固定双规则、无第二套 chain 状态机。

## Purpose

Provide editable experiment audit templates that review worker evidence and use the shared reviewer decision protocol to continue, reroute or finish a bounded experiment chain.

## ADDED Requirements

### Requirement: 实验模板支持新建和已有 reviewer

系统 MUST 允许在实验成功完成后选择新建或已有 reviewer，传递本轮审计任务及证据上下文。

#### Scenario: Existing reviewer
- **WHEN** 模板选择已有 reviewer R
- **THEN** 系统 MUST 给 R 发本轮 review task/context，MUST NOT 重发 Initial Prompt

### Requirement: 审计结果控制下一步

实验模板 MUST 使用明确结构化 CONTINUE/REROUTE/EXIT，MUST NOT 在 reviewer completed 时固定 resume 原 worker。

#### Scenario: E70 补实验后退出
- **WHEN** reviewer 先 CONTINUE E70 补 ablation，下一轮 EXIT
- **THEN** E70 MUST 只收到指定追加任务，EXIT 后 MUST 无新任务

#### Scenario: 改派现有 B
- **WHEN** reviewer REROUTE 到允许的现有 B
- **THEN** B MUST 保持原身份，完成后 MUST 回相同 chain 审计

### Requirement: 模板遵守通用退出护栏

实验模板 MUST 继承 reviewer-controlled-handoff 的 iteration/depth/stop 护栏，不另设可绕过计数。

#### Scenario: 第三轮强制退出
- **WHEN** max_iterations=3，第3轮 reviewer 仍返回 CONTINUE
- **THEN** 系统 MUST 停止继续，日志 MUST 同时保留 reviewer 原决定与 max_iterations 原因

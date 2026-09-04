## Why

Reviewer 完成不等于原 worker 应继续。系统需要明确、可审计、可恢复的 continue/reroute/exit 决策，以及 reviewer 无法绕过的有限循环。

## What Changes

- Reviewer target 支持 Start new Agent / Existing Conversation；Initial Prompt 仅新建时发送。
- 首选 automation_decision 专用 tool，使用统一版本化 JSON contract；受限 backend 可显式使用严格 JSON result adapter，禁止自然语言/markup 猜测。
- CONTINUE 当前 worker、REROUTE 另一已有 conversation、EXIT 结束 chain；动态目标经稳定身份和配置允许范围验证。
- 持久化 chain/round/decision/action 状态、去重与恢复；hard guard > reviewer decision > continuation。
- V1 必需 reviewer exit、max_iterations、max_chain_depth、用户停止、错误退出。通用 budget/status 表达式留后续。
- 扩展同一 EventRuleEditor 展示 review target、candidate scope、guards、状态与停止控制。

## Capabilities

### New Capabilities

- `reviewer-controlled-handoff`: 可由 reviewer 决定继续、改派和退出的有限、可恢复自动审计闭环。

### Modified Capabilities

无。实验模板 change 同步改为依赖此契约。

## Impact

复用 EventRulesEngine、ACP lifecycle/action、codeg-mcp companion、AutomationConfig、conversation 数据；新增持久化 chain 协议和日志，非第二套规则执行系统。依赖 action-target/success lifecycle；New target 依赖 spawn，Existing 最小切片不依赖 spawn 或 Wake。

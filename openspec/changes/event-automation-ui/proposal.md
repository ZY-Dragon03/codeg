## Why

现有后端无法让用户自行配置事件规则。Phase 1B 必须交付双入口和完整编辑器，并补齐当前会话范围实际生效所需的服务端契约。

## What Changes

- Automations 的 Scheduled/Event tabs；Conversation header 独立 Event Automation 按钮，共用规则和编辑器。
- 编辑 trigger、condition type、keywords ANY/ALL、regex、error_kind、prompt、guards、priority、scope、enabled。
- 可编辑且默认关闭的 TLS 模板、权威无副作用预览、执行日志。
- 补 TS/transport、scope、校验、日志读取；复用当前引擎，依赖 action-target 的目标验证差额。

## Capabilities

### New Capabilities

- `event-automation-ui`: 用户从全局及会话入口管理、测试和观察相同事件规则。

### Modified Capabilities

无；现有未归档子 change 的共同契约同步修订。

## Impact

Automations/Conversation UI、types/api/transport、event rule scope/校验/预览/日志双模式 core。属于 Phase 1B；本轮仅设计。

## Product model revision (2026-09-06)

The Event Automations menu is the primary product surface. It searches all rules and sorts enabled rules first, then rules applying to the current conversation, priority descending and id ascending. Creation has exactly two types: **Content detection** and **Forward after task completion**. There is no template library as the primary creation flow.

Content detection selects AI output, error, or both; supports Contains ANY/ALL, Regex, structured error category/severity/title/details and text matching; streaming can mark a match but dispatch waits for settle. Forwarding uses only `TurnComplete(stop_reason=end_turn)`, freezes the just-completed assistant report, and never treats cancellation/refusal/failure as completion.

An action may contain the source conversation and one or more existing conversation targets. Each target has an independent intent, receipt and log; the UI presents title/agent/folder and never asks for raw ids. Payload toggles control source context, recent valid user message, final report and an additional prompt. Recent valid user messages skip editable Exact/Contains/Regex ignore rules, defaulting to “继续” and “continue”.

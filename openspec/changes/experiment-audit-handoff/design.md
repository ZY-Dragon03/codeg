## Context

旧设计的双规则在 reviewer completed 后必定发送 follow-up，现已被 reviewer-controlled-handoff 的决定协议取代。此处仅保留实验领域模板及验收。

## Goals / Non-Goals

提供审计任务/context 与用户可操作模板；不复制 decision receiver、计数器、target resolver 或恢复协议。不自动 merge；默认审计任务要求检查证据而非修改代码，执行权限仍由已有 agent policy 控制。

## Decisions

- 模板 scope 使用现有 global/folder/agent/conversation 范围；用户明确选择 reviewer 及允许 continuation candidates，不能只凭 agent_type 推断已有会话。
- Initial Prompt 五问：设计合理性、数据泄漏、指标可信度、是否追加实验、需要时给具体 follow-up。Prompt 同时说明如何提交唯一结构化决定。
- 每轮 context 包含 chain/request、origin/current_worker、当前轮次/上限、工作摘要和证据引用、允许候选。引用内容仅是审计数据，不能覆盖平台协议和 guards。
- 默认 max_iterations=3、max_chain_depth=6；计数和 guard precedence 引用 reviewer-controlled-handoff，不能本地另计。
- New reviewer 每轮由 spawn receipt 绑定新 conversation；Existing reviewer 固定已有 id，每轮只发 review task/context，无 Initial Prompt 重放。
- 同一个 chain 处理 worker completion 和 reviewer decision，不用 reviewer 的 scope 规则无条件唤醒原 worker。

### 产品验收例子

| 场景 | 过程 | 结果 |
|---|---|---|
| E70 | E70 completed -> review -> CONTINUE E70:补 ablation -> E70 completed -> review EXIT | E70 仅获一次 follow-up；EXIT 后无新任务 |
| A 改派 B | A completed -> review REROUTE existing B -> B completed -> review | B id 保持；下一 CONTINUE 指 B，origin=A 仍保留 |
| 第三轮 | max_iterations=3，第3轮 reviewer 请求 CONTINUE | requested=continue / effective=exit / reason=max_iterations；不派发第4轮 worker |

每例以具体 conversation/message/decision/guard receipt 验证，不能只检查最终文字。既有 reviewer 再跑一组检查首始任务不重发。模板字段改动必须进入下一个新 chain，活动 chain 使用冻结配置；stop/停用即时生效。

## Risks / Trade-offs

审计结论正确性由领域验收判断；协议合法不意味着科学结论成立。系统保证明确交棒/护栏，不宣称自动证明实验质量。

## Migration Plan

通用闭环及 spawn 可用后集成模板；默认关闭并记录实机证据。Phase 3 完成停止，不自动启动扩展 backlog。

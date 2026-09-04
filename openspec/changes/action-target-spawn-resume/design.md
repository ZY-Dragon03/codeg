## Context

基线 9d685f36 已实现 source/specific send，代码在 event_rules/engine.rs:393-456。specific target 目前返回目标 id 却沿用 event.folder_id；发送要求 live idle connection。规划路径统一以实际 event_rules 模块为准。

## Goals / Non-Goals

复用一个动作执行层，严格区分新建和恢复。Phase 1B 补开放 selector 必需的目标验证；Phase 3 加 parent/spawned aliases 与原身份 reconnect。不存在关闭后自动新建的 fallback。

## Decisions

- canonical identity 为本数据库 conversation.id；从 DB 读取 folder_id、agent_type、external_id、parent_id，不能以 tab/runtime/connection/session id 替代。
- source_conversation 解析当前事件的 conversation；specific_conversation 解析显式 DB id；parent_conversation 解析实际 parent_id，缺失即错误；spawned_agent_conversation 解析指定 chain action 的 spawn receipt，非最近新会话。
- 解析后检验未删除、允许范围和执行能力；target folder 必须来自目标行。1B busy/offline 明确失败。Phase 3 可复用现 ACP resume 以 external_id+agent_type 和 folder 恢复同一 conversation；backend 不支持原身份恢复则停止，绝不调用 session/new 冒充 resume。
- Spawn 使用 launch envelope（agent_type、root_folder_id、isolation/branch）+ AutomationConfig（prompt_blocks/display_text/mode_id/config_values/label_snapshot，action=launch_session）。agent_type/folder 不是 AutomationConfig 内字段。
- Existing 只发纯文本 follow-up，不重放 Initial Prompt、不改 parent_id/delegation 元数据。选择 Agent 类型不能代替已有会话引用。
- 通用 max_iterations/max_chain_depth 由 reviewer-controlled-handoff 的持久化 chain 唯一拥有；执行器接受并校验 chain action authorization，不另建计数器。retry guards 保持独立，但链内 retry 继承 chain 上下文。

## Risks / Trade-offs

删除/断线/busy/target policy 变更必须在 dispatch 前重检并可见失败；不静默改目标或转 spawn。跨 folder 是 Phase 1B 公开 existing target 的前置验收，不因现有任务勾选而省略。

## Migration Plan

保留 1A 历史完成记录；1B 修正目标验证后接 UI；3 加 alias/reconnect 和 spawn（实现归 event-automation-spawn-agent），chain 归 reviewer-controlled-handoff。本轮不实现。

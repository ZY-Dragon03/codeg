## Context

见 `phase-1-event-automation` P0-1。

## Goals / Non-Goals

**Goals:** 事件 → spawn；Config 与 Automation 1:1；可从 Automation 克隆规则。

**Non-Goals:** 阶段一/二不做；不做新 prompt 存储格式。

## Decisions

- **复用 `AutomationConfig`** 序列化；launch envelope 外层存 agent_type/folder/isolation/branch，config 内保留 action=launch_session、prompt_blocks/display_text/mode_id/config_values/label_snapshot
- **「从 Automation 导入」**：复制 `config` blob 到 rule，后续独立编辑
- **Initial Prompt** = `prompt_blocks` + `display_text`，文档与 UI 明示

## Migration Plan

阶段三实现；阶段一/二 spawn 动作返回「未实现」若被误配

## 与 reviewer-controlled-handoff 的边界

New Agent 才显示 agent/model/mode/effort、Initial Prompt 和 Composer snapshot。Existing reviewer 的 selector/follow-up 由通用闭环控制，不经过本 spawn 分支，不重新发 Initial Prompt。复用同一个 EventRuleEditor；禁止为 reviewer 建第二个规则系统。

成功 turn producer（任务1.4）是共享前置，可独立先于 launch 实施。只发布无失败且 end_turn settled 的成功事件，提供唯一 turn/action correlation；不能以 session_id 区分轮次。reviewer 自身完成和 chain-owned worker 完成由 chain handler 消费，不能再次触发起始规则。

launch 前遵守已有 target policy、能力和权限验证，不自动扩大权限。快照恢复必须验证 model/mode/effort 实际生效（参考 session-config-replay-order），不能以存储字段存在代替运行结果。

spawn receipt 持久化 action_id/conversation_id/folder 和启动结果，供 spawned_agent_conversation 精确解析。New reviewer 每轮新建一次，Initial Prompt 与本轮 context 合成一次启动消息；Existing reviewer 路径不依赖此动作。

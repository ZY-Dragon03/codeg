## Context

基线 9d685f36。commands/event_rule.rs:9-57 有 CRUD/热加载；web/router.rs:1276-1297 有路由；models/event_rule.rs:20 无 scope。event_rules/types.rs:5-85 只有 turn_failed、单 condition、send、retry guard。src/lib/api.ts:3150 和 types.ts:1291 有 scheduled API/config，尚无 Event Rule TS 接口。

## Goals / Non-Goals

使用户独立配置并观察真实行为。1B 只开放 turn_failed；Spawn/Reviewer 在 Phase 3 扩展同一编辑器。不引入条件树或第二套 rich prompt 存储。

## Decisions

### 实际 UI 落点

- 全局：src/components/automations/automations-page.tsx:218 的 AutomationsPage，在 PageToolbar（:434）下增加 Scheduled Automations / Event Automations tabs。保留 workbench-route-context.tsx:21 的 automations route，无动态 Next.js route。沿用页面壳，Event 用自己的数据 hook，Scheduled 保留原逻辑。
- 当前会话：src/components/conversations/conversation-detail-header.tsx:240 右侧、overflow 左侧放独立 Event Automation 按钮，窄屏可用带 tooltip 图标，不能仅藏菜单。conversation-detail-panel.tsx:2764 已传 conversationId/folder。无需向 composer 注入 prompt。
- 同一 EventRuleEditor（规划新组件）接受 initialScope；从 C 打开 scope=C，显示本会话规则和标明全局范围的适用规则。编辑全局规则时提示影响全部会话。取消不保存；id=null 草稿禁用创建并说明先建立会话。
- CRUD 后、页面打开、窗口 focus、transport reconnect 时 refetch；V1 不依赖尚不存在的 event_rule changed 广播。

### 字段语义

Trigger 使用能力枚举，1B 仅 turn_failed 可用。Condition type=none/contains/regex/error_kind，互斥；ANY/ALL 只作用关键词。contains 与当前 matcher 一致，ASCII 不区分大小写；不宣称 Unicode case folding。regex 使用 Rust regex 默认大小写敏感语义；error_kind ASCII 不区分大小写。切换类型清除无效字段。

Resume prompt 采用普通纯文本框，契合 RuleAction.prompt:String；不把 RichComposer 附件静默展平。Phase 3 New Agent 才复用 automation-editor.tsx:78-178 的 RichComposer/AutomationConfig。

max_attempts 为整数>=1；cooldown UI 非负整数秒，无损换算毫秒并验证边界。提示其针对规则+源会话连续失败链，成功 end_turn 或距上次自动续跑30分钟可重置。现有 attempt reservation 先于发送，失败可能消耗一次尝试，界面和日志必须说明。

### scope / first-match

本 change 在 EventRuleConfig 增加 scope：global、conversation(conversation_id)、folder(folder_id)、agent_type(agent_type)；旧配置缺字段默认为 global。一次选一个 scope，服务端在 guard 前匹配，不能仅前端过滤。scope 与 target 独立。

按 priority 降序、同 priority 按 id 升序取第一条。该规则被 guard 拦截不转投下一条。预览显示胜出和被遮蔽规则，解释全局模板与 conversation 规则重叠；priority 可编辑。

### 稳定 target selector

1B 开放 source/specific existing conversation。候选使用 api.ts:1960 listAllConversations 和 :1978 子会话查询，opened tabs 仅排序，不是全集。展示 title/folder/agent，提交 DB conversation.id（types.ts:398-429）；tabId/runtimeConversationId/connection_id/external_id 不能替代。

允许有持久化身份及权限的 regular/chat/delegate，排除 reserved loop、软删除、无 id 草稿。1B 仅发送到 live idle connection；busy/offline 可见失败，不自动 spawn。执行前重检目标身份和 folder；跨 folder 修正归 action-target 1B 差额。离线 reconnect 属 Phase 3。

### 服务端补齐与日志

- TS 类型、原 CRUD wrappers；新增 scope、权威 validate/preview、分页 log read core 及 Tauri/Web 同等入口。服务端是 scope 隔离和 matcher 唯一权威。
- 保存拒绝非法 Rust regex、contains 空列表/空白关键词、空 prompt、无效 guard/scope/已删除目标。预览不 reserve attempt、不发送、不写执行日志。
- 预览接受样本事件、scope、草稿，返回条件命中、解析动作及 first-match 结果，前端不重新实现 regex。
- event_rule_log 当前只有 rule_id/conversation_id/kind/detail。增加版本化 structured detail：源/目标 id、action prompt snapshot、guard reason、时间；分页按 rule/conversation 查询。旧字段缺失标不可用，不从当前规则反推历史内容。
- 模板 builtin_key 保留；seed 仅缺失创建，不覆盖用户修改/启停。CRUD 热加载必须改变下一事件实际行为。

## Risks / Trade-offs

scope/target 验证先于 UI 开放；preview 与执行共用 matcher；旧日志不得伪造。静态代码证据不能代替 Desktop/Web 实机验收。

Phase 1 的重启验收仅覆盖配置/模板/attempt 持久化。当前 engine.rs:304-312 的 failure dedup 是进程内30秒 TTL，pending failure 也在内存；本阶段不宣称跨崩溃 exactly-once、不自动重放丢失事件，跨重启重复事件保障为 UNKNOWN_NOT_PROVEN。reviewer chain 的 durable correlation/uncertain recovery 在 Phase 3 必需，不能由此限制豁免；将来若扩展初始 failure 可靠重放需单独增加 durable event receipt。

## Migration Plan

先后端兼容默认值及校验/日志，再接 UI。保留旧配置、enabled、guard；回滚停用新增功能、保留数据。按 roadmap 八项验收，不运行本轮 implementation。

### Product UX contract (2026-09-06)

Phase 1 exposes content detection and settled completion forwarding in one editor; Spawn/Reviewer remain later extensions. The default editor is simple: enabled, natural-language trigger, contains ANY/ALL and keywords, prompt, max attempts, cooldown, test and save. Rule name, priority, scope variants, regex, structured error fields and multi-target details are under Advanced and round-trip without loss.

All Event Automation copy, validation, preview, logs, badges and confirmations comes from the ten existing next-intl locales with equal key sets. Built-in rules have a stable `builtin_key`, a localized name and built-in badge; startup or migration MUST NOT overwrite edits or enabled state. Preview is a no-side-effect “Test rule” result in human language, with technical ids in a collapsed details area. Logs map fired/skipped/failed and guard reasons to human text while retaining prompt snapshot and source/target identity.

When a header has no persisted conversation id, its Event Automation button is disabled with an explanatory tooltip; global creation remains available. Scope and target display title, folder and agent labels; internal ids are stored and shown only in technical details. Current conversation views label global, folder and agent-type rules as inherited and show only rules actually applying to that conversation.
# Current product contract

The UI presents one Automation Registry projection containing EventRules and
Wake records. The default view shows all records and orders active/waiting,
current-conversation applicability, priority, then stable id; applicability is
shown as a badge rather than implemented by silently filtering rows. Search
covers name, contains/regex/error kind, prompt, target title, creator, type,
and Wake description. The shared editor uses product labels (内容检测、一次
执行结束、等待时间/程序) and keeps technical trigger/action enums in an
optional details area.

The conversation entry uses the same registry source and defaults newly
created rules and Wakes to the current persisted conversation. A draft without
a persisted conversation id disables that entry while the global page remains
able to create global rules. User and Agent provenance is displayed, Agent
Wakes can be inspected/cancelled, and fired history is retained rather than
re-enabled as a new instance.

这次不要做到一半停下来汇报。

目标：
一次完成 Codeg Event Automation 的整个 Phase 1，
即：

Phase 1A：事件规则后端在最新 upstream/main 上稳定移植
+
Phase 1B：完整 Event Automation 产品 UI 与实机验收

完成 Phase 1 后再停止。

不要实施：
- Phase 2 agent-wake-scheduler
- Phase 3 reviewer-controlled-handoff
- experiment-audit-handoff
- event-automation-spawn-agent
- automation-extensions-*
它们的 OpenSpec 保留，但本轮禁止进入 implementation。

==================================================
0. Git / 工作区原则
==================================================

当前仓库：
F:\AI_PROJECTS\codeg

旧开发分支：
feature/event-automation-openspec

旧 Phase 1A 实现：
9d685f36

当前工作区还有：
- 本轮 41 个未提交 OpenSpec 文档
- 原有 3 个 staged migration 文件

这些内容都不得丢失。

严格禁止：
- 创建 PR
- merge 到 upstream
- push upstream
- force push
- 删除远程 branch

允许：
- commit
- fetch
- worktree
- 新建本人的 feature branch
- push origin/ZY-Dragon03/codeg

如果本任务仍无法写：
F:\AI_PROJECTS\codeg\.git

立即停止并报告：
GIT_SANDBOX_BLOCKED

不要再次通过聊天“申请授权”，因为这代表任务启动权限模式错误。

==================================================
1. 先安全保存本轮 OpenSpec
==================================================

先检查：
git status
git diff
git diff --cached
git diff --check -- openspec

确认本轮 OpenSpec 正好是 Codex 上次报告的 41 个文件。

注意：
当前 index 中已有 3 个旧 migration 暂存文件。

绝对不要把这 3 个 migration 混进 OpenSpec 文档 commit。

使用能够只提交 openspec path 的安全方式。
提交前必须检查最终 commit file list。

OpenSpec commit 建议：

docs(openspec): finalize event automation phase plan

然后仅 push 到：
origin/feature/event-automation-openspec

不得开 PR。

==================================================
2. 不在旧 0.29 基线上继续开发
==================================================

fetch：

upstream = xintaofei/codeg
origin   = ZY-Dragon03/codeg

获取最新 upstream/main。

不要对旧 feature branch force rebase。
不要污染当前旧工作区。

创建独立 worktree，例如：

F:\AI_PROJECTS\codeg-event-automation-current

新 branch：

feature/event-automation-current

base：
最新 upstream/main

优先使用 git worktree，从而保留当前旧工作区和那 3 个 migration 原样。

然后把刚刚的 OpenSpec 文档 commit 移到新 branch。

允许 cherry-pick：
仅 OpenSpec 文档 commit。

不要直接整体 cherry-pick 9d685f36。

==================================================
3. 重新调查最新 upstream 架构
==================================================

在新 worktree 里先 Explore 最新代码。

重点检查相较旧 9d685f36 已经变化的：

- ACP lifecycle
- InternalEventBus
- connection / session state
- turn settle / completion
- conversations identity
- delegation
- Automations
- Composer snapshot
- migrations
- app_state
- Tauri commands
- embedded Web handlers
- src/lib/api.ts
- src/lib/types.ts
- AutomationsPage
- ConversationDetailHeader
- conversation-detail-panel
- codeg-mcp

原则：

优先复用 upstream 最新基础设施。

旧 9d685f36 只能作为行为参考，
禁止机械复制旧实现覆盖新架构。

如果 upstream 已经提供更好的事件、会话解析、发送或状态管理能力，
采用新实现。

==================================================
4. Phase 1A：移植并恢复完整后端能力
==================================================

在最新 upstream/main 上实现/适配：

A. Lifecycle Event

Phase 1 仅真正开放：

turn_failed

保留后续 event 类型的扩展边界，
但 UI/API 不得假装：

turn_completed
terminal_exited
timer_fired
delegation_completed

已经可用。

B. Event Rules

一套 event_rule 系统：

EventRule
├─ enabled
├─ priority
├─ scope
├─ trigger
├─ condition
├─ action
└─ retry guards

C. Scope

实现：

global
conversation(conversation_id)
folder(folder_id)
agent_type(agent_type)

旧规则没有 scope：
兼容读取为 global。

scope 决定：
“哪些事件可以触发这条规则”

target 决定：
“动作发给谁”

两者必须独立。

scope 必须服务端匹配，
不能只是 UI filter。

D. Condition

Phase 1：

none
contains
regex
error_kind

contains：
- keyword list 可编辑
- ANY / ALL

ANY/ALL 只作用于 contains keyword list。

condition type 相互排斥。

前后端不得自己实现不同 matcher。

E. Action

Phase 1 仅：

send_to_conversation

支持：

source_conversation
specific_conversation

不实现 spawn_agent。

specific conversation 必须解析真实、持久化 conversation.id。

不要使用：
- tabId
- runtimeConversationId
- ACP connection_id
- external session id

作为持久 target identity。

发送前验证：
- conversation 仍存在
- folder / identity 一致
- 当前 Phase 1 要求的连接状态可发送

busy/offline：
显示明确失败和日志。

禁止 fallback spawn。

F. Retry guard

保留并验证：

max_attempts
cooldown

语义：

每 rule + source conversation 的连续恢复链。

成功 turn 或当前设计定义的 30min idle reset 后开启新链。

避免永久计数。

G. settle ordering

turn_failed 自动 action 必须在上一 turn 真正 settle 后发送。

保留/重新实现：
SessionFailure / Error 同一失败去重。

不得因为同一 TLS error 来自多个事件源而发送两次“继续”。

H. rule ordering

priority DESC

同 priority：
id ASC

first_match。

如果胜出 rule 被 guard 拦截：
V1 不继续尝试下一条 rule。

这个语义要测试、写清 UI。

I. hot reload

create
update
set_enabled
delete

后立即影响 EventRulesEngine。

无需重启 Codeg。

==================================================
5. Phase 1B 后端契约差额
==================================================

在做 UI 前先补：

1. Event Rule TS types
2. Desktop Tauri transport
3. Embedded Web transport
4. CRUD wrappers
5. validate
6. preview
7. execution log read

Desktop/Web 功能必须等价。

Validate 服务端为权威。

保存时拒绝：

- invalid Rust regex
- contains 空列表
- 空白 keyword
- 空 prompt
- invalid max_attempts
- invalid cooldown
- invalid scope
- 不存在/不可用的 specific target

Preview：

输入：
- draft rule
- sample lifecycle event

返回：
- scope 是否匹配
- condition 是否匹配
- resolved target/action
- first-match winner / shadowed rules

Preview 必须：

- 使用真实 Rust matcher
- 不 reserve attempt
- 不发送 prompt
- 不写 execution log

==================================================
6. Execution Logs
==================================================

Event Automation UI 必须能够查看执行结果。

event_rule_log 扩展为可查询的结构化历史。

至少记录：

- rule id
- source conversation id
- resolved target id
- event/trigger
- action
- action prompt snapshot
- fired / skipped / failed
- guard reason
- timestamp

max attempts / cooldown skip 必须可见。

历史日志不能使用“当前 rule 配置”倒推旧执行内容。

旧日志缺字段就显示 unavailable。

实现分页查询：

按 rule
按 conversation

==================================================
7. Phase 1B：Automations 全局入口
==================================================

不要新建第二个 automation 系统。

现有：

Automations

增加：

Scheduled Automations
Event Automations

两个 tab。

Scheduled 保持原行为。

Event Automations 使用 event_rule 数据。

全局页面至少支持：

- list
- create
- edit
- enable/disable
- delete
- priority
- scope
- trigger
- condition
- action
- guards
- preview
- logs

==================================================
8. Conversation 独立入口
==================================================

在当前最新 upstream 的 conversation header 中找到正确实现位置。

要求：

ConversationDetailHeader 右侧区域：

[ Event Automation ] [ ... ]

Event Automation 必须是独立按钮。

桌面宽度不足时：
可以仅图标 + tooltip。

但禁止只藏在 overflow menu。

点击后打开与全局页面完全相同的：

EventRuleEditor

不是第二套 Editor。

Conversation 入口带：

initialScope =
conversation(current persistent conversation.id)

用户不应该需要手填 conversation id。

这里显示：

- 当前 conversation scope 的规则
- 同时适用于它的 global rule，清楚标注 Global

编辑 Global rule 时提示：
“此修改影响所有会话”。

如果当前是 id=null / 未持久化草稿会话：
禁止创建 conversation-scoped rule，
明确提示先建立 conversation。

不要向 Composer 注入文字。

==================================================
9. EventRuleEditor
==================================================

统一产品结构：

WHEN
IF
THEN
GUARD

Phase 1 UI：

WHEN
Trigger:
turn_failed

其它未来 trigger 不得显示成可用。

IF

类型：

None
Contains
Regex
Error Kind

Contains：

Match:
ANY / ALL

Keywords：

[ RetriableError × ]
[ TLS × ]
[ connection reset × ]
[ + Add keyword ]

所有 keyword 用户可编辑、删除、增加。

内置 keyword 只是模板默认值。

Regex：
普通 regex 输入 + validate。

Error Kind：
编辑对应值。

THEN

Action：

Send to existing conversation

Target：

This conversation
Specific conversation

Conversation selector 候选来自完整 conversation 查询，
不是 opened tabs 列表。

显示：

- title
- folder
- agent

持久保存 conversation.id。

Prompt：

普通纯文本框。

示例：

继续

用户必须可以修改成任意 follow-up prompt。

不要在 Phase 1 用 RichComposer。

GUARD

Max attempts
Cooldown

输入有明确单位和说明。

==================================================
10. 内置模板
==================================================

保留：

retriable_error_auto_resume

默认：

enabled=false

默认 contains ANY：

RetriableError
TLS
connection reset
temporarily unavailable
Client network socket disconnected

action：
source conversation

prompt：
继续

max_attempts：
3

cooldown：
5 sec

关键：

这是模板，不是硬编码行为。

用户修改：

keywords
prompt
guard
enabled

后 migration / startup 都不能重新覆盖。

如果 seed 已存在：
不要覆盖。

==================================================
11. Rule overlap / Priority UX
==================================================

用户可能同时拥有：

Global TLS rule

和：

Conversation C TLS rule

UI 必须让用户知道：

- 哪条 priority 更高
- first_match 谁胜出
- 哪些规则被 shadow
- guard block 后不会 fallback 下一 rule

Preview 中直接展示。

==================================================
12. 刷新策略
==================================================

V1 不必为了这个再造 event_rule changed broadcast。

至少：

- 页面打开 refetch
- CRUD 后 refetch
- window focus refetch
- transport reconnect refetch

==================================================
13. 自动化 UI 产品验收
==================================================

不能只跑 unit test 就宣布 Phase 1 完成。

必须验证以下场景。

A. 无 API / DB / Agent

用户只使用 UI：

创建 Event Rule
编辑
保存
enable
disable
delete

Desktop 和 Web 都能操作。

B. 自定义关键词

创建：

WHEN turn_failed
IF contains ANY:
MY_CUSTOM_ERROR_123
THEN
prompt:
这是我自定义的恢复消息

确认真实 matcher 行为使用这个 keyword。

C. Prompt 修改

修改：

继续

为：

刚才出现临时网络错误，请从中断位置继续任务。

触发后必须实际发送新 prompt，
不是 migration 默认值。

D. Conversation scope

Conversation C 创建：

scope=C

Conversation D 发生同样失败：

不得触发。

C：

触发。

全局 Automations 页面看到的是同一个 rule id。

E. Preview

有效样本正确匹配。

Invalid regex：
可见报错。

Preview：
没有真正发送 prompt。

F. Guards

max_attempts=3：

前三次允许。

第四次：
不得自动发送。

日志：
skipped_max_attempts。

cooldown 内：
不得发送。

成功 turn / 30min idle reset：
符合实现定义。

G. settle/dedup

模拟：

SessionFailure
+
Acp Error

同一个 TLS failure：

最终只发送一个 configured prompt。

不得 race 上一 turn。

H. persistence

重启 Codeg：

- rule 仍存在
- enabled 状态保留
- 用户修改模板保留
- guard 状态符合当前设计

不要宣称当前 failure event dedup 跨 crash exactly-once。

这个 Phase 1 不解决该问题。

I. Scheduled regression

原 Scheduled Automations 仍正常：

- list
- create/edit
- enable/disable
- 正常页面展示

Event tab 不得破坏 scheduled。

==================================================
14. 测试要求
==================================================

Rust：

- matcher
- scope
- priority/id deterministic first-match
- contains ANY/ALL
- regex
- error_kind
- CRUD
- validate
- preview side-effect-free
- hot reload
- cooldown
- max attempts
- reset
- settle ordering
- duplicate event
- specific target resolution
- wrong folder/deleted target rejection
- structured logs

Frontend：

- Event Automations tab
- EventRuleEditor
- conversation header button
- initial current-conversation scope
- Global label
- form validation
- keyword editor
- ANY/ALL
- regex
- target selector
- prompt editing
- guards
- preview
- logs
- Scheduled regression

Desktop + Embedded Web transport tests。

==================================================
15. 构建策略
==================================================

不要每修改一点就：

pnpm exec tauri build

开发阶段使用：

- cargo check
- targeted cargo tests
- frontend vitest
- pnpm build / dev 视需要
- incremental Rust build

只在最终 Phase 1 产品验收时做一次正式：

Tauri release build

确认：
完整 frontendDist 正常。

==================================================
16. 独立 Review
==================================================

Codex 作为主执行者。

可以使用 Explore / Luna subagent 调查。

建议三个 review checkpoint：

1. 最新 upstream Phase 1A port 完成后
   独立 reviewer 检查：
   是否机械覆盖新架构、事件时序、identity、dedup。

2. Phase 1B 完成后
   独立 reviewer 检查：
   两入口是否同源、scope/target、matcher parity、UI product completeness。

3. 最终验收后
   独立 reviewer 检查：
   是否真的满足 Phase 1 acceptance，
   而不是只有测试或静态代码。

Reviewer 发现问题：
修复后继续。

不要因为中间 review 通过就提前停止。

==================================================
17. 本轮明确不实现
==================================================

只实现 Phase 1。

禁止趁机进入：

Wake Scheduler
timer_fired
terminal_exited

Reviewer decision
automation_decision
continue / reroute / exit

turn_completed review chain

spawn_agent
AutomationConfig reviewer spawn

max_iterations reviewer loop

这些已经有 OpenSpec，
但属于后续阶段。

==================================================
18. Git 收尾
==================================================

在：

feature/event-automation-current

按合理逻辑 commit。

可以有多个清晰 commit，例如：

feat(event-rules): port lifecycle automation to current main

feat(event-rules): add scope preview and execution logs

feat(automations): add event automation editor

feat(conversations): add event automation shortcut

test(event-automation): verify phase 1 product flows

最终 push：

origin/feature/event-automation-current

严格禁止：

PR
merge
upstream push
force push

==================================================
19. 最终停止条件
==================================================

只有下面全部完成才能停止：

- 最新 upstream/main 基线
- Phase 1A port 完成
- Phase 1B backend contract 完成
- Automations Event tab
- Conversation 独立按钮
- shared EventRuleEditor
- custom keywords
- custom prompt
- scope
- specific existing target
- guards
- preview
- logs
- persistence
- Desktop/Web
- Scheduled regression
- tests
- 最终 release build
- push origin

如果某项无法验证：

不能写 PASS。

标：

NOT_PROVEN

并说明原因。

最终报告必须包括：

1. 新 branch 和 base upstream SHA
2. commit 列表
3. 主要实现文件
4. Phase 1 acceptance 逐条 PASS / FAIL / NOT_PROVEN
5. Rust 测试
6. Frontend 测试
7. Desktop 实机结果
8. Web 实机结果
9. 最终 codeg.exe 路径
10. 当前 Event Automation 的实际使用方法
11. 已知限制
12. 未进入 Phase 2/3 的确认
13. push 到 origin 的最终 SHA
14. 明确确认：
    - No PR
    - No merge
    - No upstream push
    - No force push
## Purpose

Enable users to create, edit, test and observe event automations from global and conversation entry points using one shared rule system without API or database assistance.

## ADDED Requirements

### Requirement: 双入口管理同一规则

系统 MUST 提供 Automations Scheduled/Event 页签和 Conversation 独立 Event Automation 按钮，共用规则数据和编辑器。

#### Scenario: 当前会话创建后全局编辑

- **WHEN** 用户从持久化会话 C 创建规则
- **THEN** 全局列表 MUST 显示同一 id，编辑/启停后两入口 MUST 读取相同配置，用户无需 API/DB/Agent

### Requirement: 范围限制实际匹配

系统 MUST 支持 global/conversation/folder/agent_type scope，从 C 打开 MUST 默认 scope=C，并在执行前校验。

#### Scenario: 两会话相同错误

- **WHEN** C 专属规则启用，C 和 D 出现相同错误
- **THEN** 该规则 MUST 仅响应 C，不能将 target=C 误当作事件 scope

### Requirement: 完整 Phase 1 编辑字段

系统 MUST 提供支持的 Trigger、condition type、keywords、ANY/ALL、regex、error_kind、prompt、max_attempts、cooldown、priority、enabled。条件类型 MUST 明示互斥，ANY/ALL MUST 仅作用 keywords。

#### Scenario: ANY 与 ALL

- **WHEN** keywords 为 RetriableError 和 TLS，样本只含 TLS
- **THEN** ANY MUST 匹配，ALL MUST 不匹配

#### Scenario: 不支持的 Trigger

- **WHEN** 当前只支持 turn_failed
- **THEN** 其他 Trigger MUST 不可保存为启用规则，界面 MUST 标明尚不可用

### Requirement: 模板是可编辑数据

TLS 模板 MUST 默认关闭，允许修改条件/prompt/guards，重启 MUST 保留编辑。

#### Scenario: 模板改为 X 和 Y

- **WHEN** 用户将 keywords 改为 X、prompt 改为 Y 后启用
- **THEN** 匹配 X MUST 发送 Y，旧关键词不得因硬编码继续命中

### Requirement: 权威校验与编辑器表面

系统 MUST 拒绝非法 regex、空关键词/空 prompt/非法 guard。后端预览 API MAY 保留供内部诊断或自动化测试使用，但普通产品编辑器 MUST NOT 暴露“测试匹配”“测试规则”“Preview Rule”或等价的样本输入、运行测试和匹配结果区块。

#### Scenario: 非法正则

- **WHEN** 用户填写无效 regex
- **THEN** 系统 MUST 显示错误并拒绝保存/启用

#### Scenario: 编辑器不暴露测试匹配

- **WHEN** 用户打开内容检测、任务完成后转发或唤醒的创建/编辑页面
- **THEN** 编辑器 MUST NOT 显示测试匹配、测试规则、Preview Rule、Test Match 或对应的样本输入和运行测试控件

### Requirement: first-match 可解释

系统 MUST 按 priority 降序、同 priority 按稳定 id 升序选第一条匹配规则，显示遮蔽关系；guard 拦截 MUST NOT 转投下一规则。

#### Scenario: 全局规则遮蔽专属规则

- **WHEN** 两者均匹配，全局规则排序在前
- **THEN** 预览 MUST 指明胜出规则和专属规则未执行的原因

### Requirement: 执行限制及日志可见

系统 MUST 展示源/目标、发送、guard 跳过和错误记录；max_attempts/cooldown MUST 实际限制发送。Desktop/Web MUST 可操作相同功能。

#### Scenario: 上限与冷却

- **WHEN** 同规则同源会话已自动尝试三次或处于冷却期
- **THEN** MUST 不再发送并显示原因

#### Scenario: 关闭规则

- **WHEN** 用户关闭规则后产生匹配事件
- **THEN** MUST 不执行该规则，刷新后 MUST 保持关闭

### Requirement: Event menu MUST expose the fixed product model

The menu MUST search all Event Automations and sort by enabled descending, applies-to-current-conversation descending, priority descending and id ascending. Add custom MUST offer exactly Content detection and Forward after task completion; a template library MUST NOT be the primary creation path.

#### Scenario: Current conversation menu

- **WHEN** the menu is opened for conversation C
- **THEN** it MUST include applicable global/folder/agent/conversation rules, mark inherited rules, and apply the specified stable sort

### Requirement: Creation entry MUST fix automation type in the editor

Add custom MUST open a type-specific editor for Content detection or Forward after task completion. The editor MUST NOT expose an in-editor automation-type switch; the chosen creation entry is the only way to pick the type for a new rule. Editing an existing rule MUST preserve its stored type without offering a type switch.

#### Scenario: Content detection from conversation menu

- **WHEN** the user chooses Add custom → Content detection for conversation C
- **THEN** the editor MUST open as a content-detection rule with `content_matched` trigger and MUST NOT show automation-type toggle buttons

#### Scenario: Forward after task completion from conversation menu

- **WHEN** the user chooses Add custom → Forward after task completion for conversation C
- **THEN** the editor MUST open as a completion-forwarding rule with `turn_completed` trigger and MUST NOT show automation-type toggle buttons

### Requirement: Content detection MUST settle before dispatch

Content rules MUST select AI output, error or both and support Contains ANY/ALL, Regex and structured error category/severity/title/details plus text matching. A streaming match MAY set pending `matched=true`, but MUST NOT send while the turn is active; the action is evaluated once after settle.

#### Scenario: Streaming assistant match

- **WHEN** a ContentDelta matches during an active turn
- **THEN** no target receives a message until the turn settles

### Requirement: Completion forwarding MUST use end_turn only

Forward after task completion MUST trigger only on `TurnComplete(stop_reason=end_turn)`. Cancellation, refusal and failure are not completion. The Agent Report is the final assistant text from the just-ended turn, frozen after settle, excluding prior turns, reviewer/tool/reasoning text; empty reports are marked unavailable.

#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Payload and recent-message extraction MUST be explicit

The editor MUST provide toggles for source conversation info, recent valid user message and final report, plus an additional prompt textarea. Recent valid user message extraction walks backward from the completed turn and skips editable Exact/Contains/Regex ignore rules, defaulting to “继续” and “continue”.

#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Multi-target forwarding MUST be independently receipted

An action MAY include the source conversation and multiple existing targets. The UI MUST show title/agent/folder instead of raw ids. Each target MUST have an independent intent, receipt and log; partial success MUST remain visible. The same turn/rule/target MUST be idempotent.

#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Preview and logs MUST describe runtime truth

Preview MUST distinguish `target_exists` from runtime availability and MUST NOT consume guards, send, or write execution logs. Logs MUST preserve source and target titles/ids, prompt snapshot, trigger, action, guard reason and explicit errors such as action-sent/log-write-failed.

#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: UI localization MUST match native Codeg locales

All Event Automation user-facing strings MUST use next-intl and the ten existing locales with identical key sets. Machine values such as trigger and action may appear only in technical details. An unsaved conversation header button MUST be disabled and explain that a first message is required.

#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Wake creation UI MUST be productized for humans

The Wake editor MUST treat the display name as optional and auto-name empty user wakes as `唤醒_<id>`. Delay triggers MUST use an explicit numeric value plus unit (seconds, minutes, hours) with no silent fallback for empty or zero values. Scheduled-time triggers MUST show the client timezone and interpret `datetime-local` in that timezone. Process-exit triggers MUST select from running terminals via searchable metadata and MUST NOT require manual terminal/process ID entry in the primary UI. The wake prompt MUST use a textarea; the target conversation MUST default to the current conversation and show conversation titles instead of raw ids.

#### Scenario: User leaves wake name blank

- **WHEN** a user saves a wake without entering a display name
- **THEN** the registry MUST show a stable auto name `唤醒_<id>` while Agent-created wakes with explicit names remain unchanged

#### Scenario: User schedules a local time

- **WHEN** a user enters `2026-09-08 09:30` in their local timezone
- **THEN** the saved wake MUST fire at that local instant and reopening the editor MUST display the same local time with the current client timezone label

### Requirement: Automation dialog layout MUST stay width-invariant

The conversation-header automation dialog MUST use a fixed outer width that does not change when switching between the registry list, content-detection editor, completion-forwarding editor, or wake editor, including when changing triggers, radios, or selects inside those editors. Height MAY change with content; when content exceeds the viewport the dialog MUST scroll internally rather than resizing horizontally. Content width MUST NOT determine dialog width.

Registry is the level-one surface inside the dialog. Content Detection, Completion Forwarding, and Wake editors are level-two subpages inside the registry and MUST render inside a distinct bordered, rounded, padded surface with a divider between the subpage header and form body. The outer dialog close control MUST dismiss the entire automation window; the inner back control MUST return to the registry list only.

Each automation editor subpage MUST keep only “Back to Automation List” in its sticky secondary navigation. The creation/edit title, rule name, and all form sections MUST remain normal scrolling content. Generic sections such as “When…” and their descriptions MUST be fully visible below the sticky navigation and MUST NOT be clipped when the editor scrolls or focuses a field. Sticky navigation MUST use an opaque or sufficiently solid background, correct stacking order, and stable padding without changing dialog width or causing horizontal layout shifts. Section anchors and focus scrolling MUST account for the sticky offset (for example with scroll padding or scroll margin).

The Content Detection, Completion Forwarding, and Wake editors MUST share one editor design language and one conversation delivery target picker. The picker MUST expose Current conversation, All current conversations, and Specific conversations. Only Specific conversations MAY expand the searchable multi-select; All current conversations MUST save the current eligible conversations as a fixed snapshot and MUST NOT silently include future conversations. Search, active-first/recency sorting, titles, agent metadata, selected state, and scrolling MUST use the shared picker component.

The editor MUST distinguish the conversations where an automation listens from the conversations that receive its action. The three automation types MUST persist the same target contract, and a Wake MUST remain one registry item even when it has multiple saved target conversations.

The editor MUST NOT expose an Advanced Settings container. Meaningful priority and listening-scope controls MUST appear as ordinary sections without exposing internal names such as `RuleScope`, `conversation_ref`, or raw ids. The existing product editor MUST continue to omit test-match and rule-preview controls.

#### Scenario: Switching wake trigger modes

- **WHEN** a user opens wake creation and switches among delay, scheduled time, and process-exit triggers
- **THEN** only the subpage height MAY change while dialog width, subpage width, and form column width remain unchanged

#### Scenario: Opening an event-rule subpage

- **WHEN** a user opens content detection or completion forwarding from the registry
- **THEN** the UI MUST show a back link to the registry list and the editor form inside a secondary surface rather than bare form fields in the dialog root

#### Scenario: Scrolling an editor subpage

- **WHEN** the user scrolls content detection, completion forwarding, or wake creation/editing
- **THEN** only the back navigation remains sticky; creation/edit titles and rule names MAY scroll away, while “When…”, “Then automatically send”, and “Automatic recovery limits” headings remain fully readable and the dialog width stays unchanged

#### Scenario: Shared delivery targets

- **WHEN** the user opens Content Detection, Completion Forwarding, or Wake editing
- **THEN** each editor MUST show the same compact delivery target choices; the default view MUST contain no conversation list, and only Specific conversations MAY reveal the shared searchable multi-select

#### Scenario: Fixed all-current snapshot

- **WHEN** the user saves All current conversations
- **THEN** the automation MUST persist the eligible conversations present at save time as its target snapshot and MUST NOT add a later conversation implicitly

#### Scenario: No running programs

- **WHEN** no eligible running terminal exists for process-exit wake creation
- **THEN** the UI MUST show an empty-state message instead of a free-text process ID field

### Requirement: Wake registry active state MUST mirror lifecycle status

In the automation registry, Wake rows MUST use the same active control pattern as Event Rules. `pending` and `dispatching` MUST render as active/checked. `sent`, `failed`, and `cancelled` MUST render as inactive/unchecked. The checked state MUST be derived only from wake `status` (and legacy rows without status while still enabled), not from a separate frontend enabled flag.

A successful one-shot fire MUST automatically move the wake from active to inactive in the registry UI after refresh. Unchecking an active pending wake MUST mean cancel and MUST call the existing cancel API immediately, without a second confirmation dialog. Terminal wakes MUST be re-enabled through `wake_rearm` or edit-and-save, not by silently toggling a disabled switch. Switching OFF cancels; Trash permanently deletes.

#### Scenario: Pending wake shows active

- **WHEN** a wake row has status `pending`
- **THEN** the registry MUST show a checked active control and a pending status label

#### Scenario: Successful fire becomes inactive

- **WHEN** a pending wake transitions to `sent` after firing
- **THEN** the registry MUST show an unchecked control and a sent status label without manual refresh beyond the registry change event

#### Scenario: Unchecking an active wake cancels it

- **WHEN** a user unchecks an active pending wake
- **THEN** the wake MUST be cancelled via the existing cancel API and the row MUST reload as unchecked with status cancelled

#### Scenario: Inactive wake can be rearmed

- **WHEN** a user checks an inactive `sent`, `failed`, or `cancelled` wake and rearm preconditions are satisfied
- **THEN** the same wake id MUST return to `pending` with a freshly computed schedule

#### Scenario: Terminal wake can be edited and re-enabled

- **WHEN** a user edits a `sent`, `failed`, or `cancelled` wake and saves
- **THEN** the wake MUST return to `pending` and show as checked in the registry

#### Scenario: Wake can be permanently deleted

- **WHEN** a user deletes a stable wake row from the registry
- **THEN** the wake MUST be removed from persistent storage and MUST NOT fire again

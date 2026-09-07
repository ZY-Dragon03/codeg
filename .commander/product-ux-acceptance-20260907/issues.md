# GUI-confirmed defects
Baseline 26c6d836f5c8a8eab708b6b989d9803a5333e419, release Codeg, zh-CN, 1294x796.

## UX-001 P2 OPEN Registry semantics
Repro: open existing conversation say "1" -> upper-right 自动化.
Actual: Wake cards expose agent, conversation:332, after 15s, agent UUID; different conversation targets all show 当前对话; no readable waiting/fired/failed/cancelled status; repeated target text. Screenshot UX-001-registry.png.
Expected: readable lifecycle, title-based targets/creator and correct applicability, no redundant metadata.

## UX-002 P1 FIXED Type selection ignored
Repro: upper-right 自动化 -> 添加自定义 -> 任务完成后转发.
Expected: open a completion-forwarding editor fixed to that type; no in-editor automation-type switch. Content detection entry opens a content-detection editor the same way.

## UX-003 P1 OPEN Completion editor retains failure form
Repro: UX-002 then manually click 任务完成后转发 type.
Actual: task-failure title/help, error contains, keyword controls remain; top description says failure; default prompt 继续; duplicate 事件自动化 headings. Screenshot UX-003-forward-error-fields.png.
Expected: normal turn completion explanation, targets, payload options and additional prompt as core fields; only relevant guards and no failure matcher. Content detection must use source-aware labels rather than always error wording.

## UX-004 P2 OPEN Global/conversation creation inconsistency
Global -> 事件自动化 uses 自动化注册表 / 新建自动化 / 新建唤醒 versus dialog 事件自动化 / 添加自定义. Global also falsely marks wakes 当前对话 despite no current context. Screenshot UX-004-global-registry.png. Expected consistent model and understandable naming.

## UX-005 P2 OPEN Wake form lacks usable field semantics
Global -> 事件自动化 -> 新建唤醒. Delay field has generic placeholder 秒数、时间或进程 ID with no explicit numeric unit selector; all field labels are placeholders; prompt is single-line; optional target has no explanation of destination when global. Screenshot UX-005-wake-form.png. Expected named fields, quantity/unit, multiline prompt, clear required/default existing target.

## UX-006 P1 OPEN Process-exit user workflow requires internal ID
New Wake -> trigger 进程退出时. Bare text field placeholder 秒数、时间或进程 ID remains. No running-process selector or way to discover owned terminal identity. Screenshot UX-006-process-id-input.png. Expected select actual running program with display command and ownership, never guessed ID. Pause this test branch pending Luna fix.

## UX-007 P2 OPEN Run history unreadable and crushes list
Repro: global Event Automations -> search AGENT_RULE_FIX_0906 -> 运行记录.
Actual: fired/failed raw status, raw conversation ID/English connection error, truncated JSON/report shown as detail, no named source/receiver or sent prompt; no visible close/collapse. History takes most height and rule list shrinks to ~55px with its own scrollbar. Screenshot UX-007-logs-layout.png.
Expected: human status/cause and source/target/prompt, expandable technical detail, bounded scroll, dismissible history leaving useful list/editor navigation.

## Test progress
Global entry, conversation entry, add-menu type choices, manual type toggle, wake open/cancel/type select, exact rule-name search and run-history buttons exercised. Name search AGENT_RULE_FIX_0906 correctly finds single row. Other inventory entries remain NOT_RUN.

## UX-008 P2 OPEN Localized search and empty-state ambiguity
Global registry search Agent 创建 yields 暂无自动化 despite existing agent-created rows. Expected localized creator/type keywords searchable and empty result says no matching automation, not no automations. Stale run history remains without selected rule name after filter removes rule (also UX-007). Screenshot UX-008-localized-search.png.

## UX-009 P1 OPEN Empty Wake save gives no feedback
Repro global Event Automations -> New Wake -> leave every field empty -> 保存 -> wait and observe again.
Actual remains identical form, no field validation, error, success or explanation. Save appears enabled. Screenshot UX-009-wake-empty-save.png.
Expected reject invalid prompt/target/time with localized inline messages, preserve draft, catch submission errors.

## UX-010 P2 OPEN Duplicate editor title and failure-first default
Repro global New Event Automation opens editor.
Actual dialog shows outer 事件自动化 and inner 事件自动化 headings, then task failure wording before a user chooses a type; content detection defaults to AI output with failure-like keywords and continuation prompt. Screenshot UX-010-duplicate-editor-heading.png.
Expected one clear title and type-specific explanation/defaults.

## UX-011 P1 OPEN Target picker exposes raw conversation content
Repro content detection editor -> scroll to the target conversation area.
Actual the picker lists checkboxes with raw recent prompts, agent labels and truncated paths/plugin text instead of conversation titles and folder/agent context. There is no target search or clear selected-target summary; choosing the wrong existing conversation is easy. Screenshot UX-011-target-list-raw-content.png.
Expected searchable title-based target picker with readable title, Agent, Folder and selected target chips; internal IDs and raw prompt bodies remain technical details.

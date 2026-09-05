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

### Requirement: 权威预览和输入校验

系统 MUST 提供与真实执行同语义的无副作用预览；拒绝非法 regex、空关键词/空 prompt/非法 guard。预览 MUST 显示 scope、匹配结果和目标，MUST NOT 消耗 attempts 或发送。

#### Scenario: 非法正则
- **WHEN** 用户填写无效 regex
- **THEN** 系统 MUST 显示错误并拒绝保存/启用

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

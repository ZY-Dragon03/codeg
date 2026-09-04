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

## Purpose

Provide a bounded review loop in which a reviewer explicitly continues an existing worker, reroutes work to another existing conversation, or exits, with auditable decisions and safe recovery.

## ADDED Requirements

### Requirement: Reviewer 决策确定且受身份约束

系统 MUST 接受明确的 continue/reroute/exit 结构化决定，绑定当前 chain/review request/reviewer；MUST NOT 从普通自然语言或 markup 推测决定。

#### Scenario: 没有有效决定
- **WHEN** reviewer 完成本轮但无有效结构化决定
- **THEN** chain MUST 可见终止为 decision_missing，不自动 resume worker

#### Scenario: 无效决定默认停止
- **WHEN** reviewer decision 缺失、无法解析、字段无效或身份不符
- **THEN** 系统 MUST 默认 STOP 并记录具体原因，MUST NOT 自动 CONTINUE；STOP 是安全终态而非隐式重试

#### Scenario: 错误调用者
- **WHEN** 非当前 reviewer 尝试提交决定
- **THEN** 系统 MUST 拒绝且不派发动作

### Requirement: 动态 continuation 仅指向已有会话

CONTINUE MUST 指当前 worker；REROUTE MUST 指用户允许的另一个已存在 conversation，并附非空 prompt。EXIT MUST 结束链而不发送后续任务。

所有 dynamic target MUST 在派发时重新通过用户配置的 allowed-target policy；仅在 UI selector 中过滤候选不足以满足此要求。目标后来失效或脱离允许范围时 MUST STOP，不扩大允许范围。

#### Scenario: 改派 Worker B
- **WHEN** reviewer 返回 reroute 到允许的现有 B
- **THEN** 系统 MUST 向 B 发送 follow-up；B 完成后 MUST 回到相同 chain 的 reviewer，下一次 CONTINUE MUST 指向 B
- **THEN** MUST NOT 因 agent type 选择而新建会话

### Requirement: Review target 区分新建与已有

系统 MUST 提供 Start new Agent / Existing Conversation；新建模式 MUST 使用启动快照，已有模式 MUST 只发送本轮 review task 和 context。

#### Scenario: 使用已有 reviewer
- **WHEN** 选择现有 reviewer R
- **THEN** 每轮 MUST 复用 R 并只发 follow-up，MUST NOT 重发 Initial Prompt

### Requirement: 硬退出优先于 reviewer

系统 MUST 执行 hard guard > reviewer decision > continuation。V1 MUST 有 reviewer exit、max_iterations、max_chain_depth、用户 stop 和错误终止；达到上限不能被 reviewer 覆盖。

#### Scenario: 第三轮仍要求继续
- **WHEN** max_iterations=3 且第三轮 reviewer 完成后请求 CONTINUE
- **THEN** 系统 MUST EXIT，记录原决定及 max_iterations 原因，MUST NOT 自动开始第四次 worker

#### Scenario: 深度先达上限
- **WHEN** 下一自动动作会超过 max_chain_depth
- **THEN** 系统 MUST 停止新派发，不能借 retry 重置深度

### Requirement: 一轮按 worker 和 reviewer 计数

worker 成功完成后进入 reviewer 构成一轮，reviewer settle MUST 完成该轮计数一次；重复事件 MUST NOT 计新轮。retry 成功/空闲 MUST NOT 重置 review 计数。

max_iterations=N MUST 允许第 N 轮 reviewer 执行；当该轮成功 settle 后 completed_iterations=N，MUST NOT 再派发 worker continuation。reviewer 失败 MUST 终止链，不凭失败或重放增加新一轮。

#### Scenario: 重复完成
- **WHEN** 同一本轮完成被重复投递
- **THEN** 系统 MUST 只增加一次 completed_iterations 并最多派发一个下一动作

### Requirement: 决策与动作可幂等审计

每个 review request MUST 只接受一个有效决定，同一幂等键相同内容 MUST 返回原结果，冲突内容 MUST 拒绝。系统 MUST 持久化决定、guard、目标和执行结果。

hard guard 覆盖 reviewer 决定时 MUST 同时保存 requested_decision、effective_decision 和 override reason，例如 requested=continue / effective=exit / reason=max_iterations；MUST NOT 用最终动作覆盖原始请求的审计记录。

#### Scenario: 决策响应丢失后重试
- **WHEN** reviewer 重提相同决定
- **THEN** 系统 MUST 返回原 receipt，MUST NOT 再次发送

### Requirement: 只消费关联的 settled turn

系统 MUST 在当前 reviewer 成功 settle 后消费决定，并区分 chain 内 turn 与人工/旧 turn；reviewer error/cancel MUST 终止本轮自动动作。

#### Scenario: Reviewer 提交后失败
- **WHEN** reviewer 提交 CONTINUE 后 turn 失败
- **THEN** 系统 MUST NOT 派发 continuation，日志 MUST 保留决定及失败原因

### Requirement: 恢复和用户停止不产生隐式重发

系统 MUST 保留 chain 身份/计数及终态；发送是否发生不明时 MUST 停止并提示核对。用户 stop 后 MUST 不再获准新动作；已经发出的动作 MUST 明确显示。

#### Scenario: 发送与回执之间重启
- **WHEN** 重启后不能确定某 action 是否已发送
- **THEN** chain MUST 进入 recovery_uncertain，MUST NOT 自动重发或创建新 agent

#### Scenario: 停止后迟到完成
- **WHEN** 用户停止 chain 后收到旧完成
- **THEN** MUST 保持终态，不能重新开启链

### Requirement: 能力与不可用目标显式处理

系统 MUST 验证 reviewer 决策通道及 existing target 的身份/可用性；无法使用的通道或目标 MUST 可见拒绝或终止，MUST NOT 自动切通道、改目标或 spawn。

#### Scenario: 离线目标无法原身份恢复
- **WHEN** backend 无法恢复指定 existing conversation
- **THEN** 系统 MUST 记录 target_unavailable 并停止，不重新创建会话

### Requirement: Allowed targets MUST be frozen and rechecked

Chain creation MUST save explicit conversation ids and/or an opted-in folder scope as an allowed-target policy snapshot. Each dynamic dispatch MUST re-read the target identity and revalidate that policy. A narrowed policy, deleted or out-of-scope target MUST STOP; selector filtering MUST NOT replace dispatch validation and the system MUST NOT broaden the policy or spawn a fallback.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Iteration and depth counters MUST be exact

`completed_iterations` starts at zero and increments once for each unique reviewer turn that settles successfully. A settled turn with a missing or invalid decision increments once and then defaults to STOP. ACP error/cancel, duplicate completion, tool calls and ordinary human turns do not increment. Before an automatic dispatch, `next_depth = depth + 1` MUST be no greater than `max_chain_depth`; reaching the limit consumes the current result but creates no next action.


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

### Requirement: Guard overrides MUST retain requested and effective decisions

When a reviewer requests CONTINUE but a hard guard forces EXIT/STOP, the chain state and execution log MUST retain `requested_decision=continue`, `effective_decision=exit` and the guard reason (for example `max_iterations`).


#### Scenario: Contract is observable

- **WHEN** the product receives the event or request described by this requirement
- **THEN** the system MUST apply the requirement and expose its result in the response or structured log

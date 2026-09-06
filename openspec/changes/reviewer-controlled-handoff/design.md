## Context

基线 9d685f36：
- event_rules/types.rs:7,41-85 仅 turn_failed/send/source/specific，无 chain 或 reviewer。
- engine.rs:76-117 订阅 InternalEventBus；:201-274 在 TurnComplete 后处理错误，成功仅重置 retry；:393-438 send 要求 live idle connection。
- event_rule_service.rs:157-225 只有规则+源会话 attempts/cooldown；30分钟 reset 是 retry 概念，不能复用作 review iteration。
- acp/delegation/companion.rs:137-211 有 feature-gated tools；:380 tools/list、:492 tools/call 双重 gate。connection.rs:4154-4196、:4340-4455 把 socket/token/parent connection 注入 companion；:5044-5074 有 capability 分支。
- QuestionSpec/QuestionAnswer 面向人类问答，不是 reviewer 自主结果协议。当前没有 automation_decision tool，也没有统一强制 final-output schema。
- models/automation.rs:84-102 有 AutomationConfig；automation/engine.rs:418-424、:481-484 重放快照并新建 session。
- conversation 表 id/folder/agent/external_id/parent_id/delegation_call_id 可复用，但 delegation depth 只沿 parent_id，不能充当动态交棒的 chain depth。

## Goals / Non-Goals

允许 reviewer 输出有权重的明确决定，平台负责身份、护栏、幂等与派发。V1 单 worker/单 reviewer 串行；不做 fan-out、通用工作流、自动 merge、自由文本意图解析或跨主机目标。

## Decisions

### 1. 表达路径比较与选择

| 方案 | 确定性、跨 backend、恢复代价 | 裁定 |
|---|---|---|
| 专用 tool/command + JSON 参数 | 可验证 schema；现 companion/认证路由可复用；调用时立即 durable ack；依赖 session 实际注入能力 | **首选 automation_decision** |
| Strict final JSON | 不要求 backend 原生 schema enforcement；需适配 final 文本和确切 turn 身份；格式失败率较高 | 显式配置的兼容 adapter |
| 特殊 markup/自然语言关键词 | 易被普通说明、引用、截断污染；难稳定定位决策边界 | V1 不采用 |

canonical contract 只有一套；adapter 只负责输入，不自行派发。不得假定所有 Cursor/Codex/ACP session 均能收到新工具：启用链时检查 reviewer session capability、feature gate 和 receiver；Windows/其他平台实际 companion 通道也需验证。已有 reviewer 若运行时不能安全注入新工具，可选已实现 JSON adapter；两者皆无则禁止启动并说明原因。不为获得工具偷偷新建 conversation，也不修改 agent 全局配置。

JSON adapter 为规则显式 transport 选项；只解析本轮成功完成后的最终 assistant 文本，整个 trim 后正文必须是单个 JSON object，禁止围栏、尾随文本、多对象、unknown keys；禁止从 transcript/中途 delta/tool output 扫描。必须绑定 review_request_id 和本轮完成事件。工具模式失败不自动降级 JSON，避免双重消费。原生 schema enforcement 有则可用，但协议不依赖它。

### 2. 决策 contract 与权限

建议请求字段（设计，不是已实现接口）：

```json
{
  "version": 1,
  "chain_id": "chain-opaque-id",
  "review_request_id": "request-opaque-id",
  "decision_id": "idempotency-id",
  "decision": "continue",
  "target_conversation_id": 70,
  "prompt": "按审计意见补充 ablation",
  "reason": "missing ablation"
}
```

decision=continue 必须 target=current_worker_conversation_id；reroute 必须是另一个已存在、允许且可继续的 conversation。exit 禁止携带 target/prompt，reason 表达 PASS/DONE/证据充分等审计解释。continue/reroute 必须有非空 prompt。agent_type 不是 target，不能产生隐式 spawn。decision 不允许设置 iteration/depth/budget/actor 字段。

actor 由 authenticated companion parent-connection -> DB conversation 和当前 review request 映射，不能相信请求自报。chain/request id 是 correlation，不是授权凭据；服务端校验调用者等于当前 reviewer、请求未终止、当前 turn 确实属于该 request。Final JSON 也绑定相同平台会话/turn。

相同 decision_id + 相同 payload 重试返回原 receipt；同 id 不同 payload 拒绝。一个 review_request 只接受一个有效决定，不同 id 的第二决定拒绝，不能“最后输出获胜”。结构错误 tool 返回明确错误，reviewer 可在同一 turn 内修正；未获有效决定便结束则终止 decision_missing。首个有效决定不可撤回；后续普通文本不能改写。

候选通过 readonly candidate listing（复用现 session registry/query，再加 chain 范围过滤）给出 id/title/folder/agent/availability。用户在规则上选择候选 conversation 集或 folder 范围，默认源 folder；审核后执行前再次验证。源 worker 自动在允许集内，跨 folder reroute 需被配置允许；不能把所有打开 tab 视为已授权，不能接受任意 agent type。

### 3. Stable reference 与 reviewer target UI

长期引用为本 Codeg 数据库的 conversation_id。external_id+agent_type 用于执行时恢复会话；folder 从目标 DB 行读，connection_id/session runtime key 不持久化为 canonical identity。原始 origin_worker 与当前 current_worker 分开记录，reroute 后当前 worker=B，下轮 CONTINUE 指向 B，原始 E70 仍可经允许的 REROUTE 返回。

source_conversation 指当前事件来源；parent_conversation 读取 DB parent_id；specific_conversation 指显式 DB id；spawned_agent_conversation 必须绑定 chain action_id 的 spawn receipt，不能选“最近一次”新会话。review 回到 worker 使用 chain.current_worker，不把 reviewer 的 source/parent 默认当 worker。现有 delegate 元数据仅可作上下文，不改 parent_id 表示 reroute。

同一 EventRuleEditor 的 Review target：
- Start new Agent：agent、folder、model/mode/effort、Initial Prompt、AutomationConfig snapshot；agent/folder 位于 launch target envelope，不谎称是 AutomationConfig 内字段。snapshot 的 prompt_blocks/display_text/mode_id/config_values/label_snapshot 原样兼容。每轮创建新的 reviewer，启动消息=快照任务+本轮上下文，不重复发送 Initial Prompt。
- Existing Conversation：selector + 本轮 follow-up review prompt；隐藏 New-only 字段，不能重新发 Initial Prompt。后续轮次复用同一 reviewer id。
- 两者都配置候选范围、max_iterations、max_chain_depth，并显示 chain 状态/stop；reviewer=self worker 禁止，已有 reviewer 被另一 chain 占用或正 busy 时拒绝本轮，不插入并行 prompt。

### 4. 状态、轮次与 guard precedence

新建 chain 时冻结规则版本、review target、允许目标范围、guards；禁用规则或用户 stop 仍即时终止活动链。记录 chain_id、origin/current_worker、reviewer、review_request_id、causal action/turn ids、iteration、completed_iterations、depth、status、stop_reason 和配置快照。

状态：worker_wait -> review_dispatch -> review_wait -> decision_ready -> continuation_dispatch -> worker_wait；终态 finished/stopped/failed。tool 只持久化 decision 并返回 receipt，不在 reviewer turn 尚未 settle 时唤醒 worker。收到该 reviewer 的成功 settled completion 后才能消费决定；reviewer failure/cancel 终止，不能消费此前 continue。

worker->reviewer 为一轮：worker 成功完成时开始轮次 i=completed_iterations+1；reviewer 成功 settle（即使随后因缺决定失败）时完成该轮计数一次。max_iterations=N 允许第 N 轮 reviewer 进行，但第 N 轮之后不派发 continuation。失败/重放不增加新一轮，轮次不能被 retry 成功或30分钟空闲重置。

hard guard > reviewer decision > continuation action：
1. 用户 stop/规则停用/不可恢复错误，以及 depth/iteration 上限，优先产生不可逆终态。
2. 若无 hard guard，有效 EXIT 结束；有效 CONTINUE/REROUTE 才解析已有目标。
3. 原子占用下一 action 并在 dispatch 前再次检查 stop/guards；不能仅在 tool 接收时检查。

max_chain_depth 按同一 chain 每次获准自动派发计一跳：worker->review、review->worker、chain 内 retry 都计数；tool 调用、重复事件不计。到上限可消费当前动作结果但禁止新的自动派发。默认 max_iterations=3、max_chain_depth=6，均正整数且必填/有默认；UI 提示 depth 太低可能提前结束。委派树 depth 和 retry max_attempts 是额外限制，不能替换这两个计数。

例：review1 depth=1，continue worker depth=2，review2 depth=3，continue worker depth=4，review3 depth=5；completed_iterations=3 即使 CONTINUE 也 exit(max_iterations)，无第4次 worker。max_depth=2 则 worker2 完成后禁止 review2，写 depth exit。所有由链引发的重试继承 chain id/depth，不能被普通 turn_failed 规则重置为新 chain。

### 5. Correlation、恢复与停止

不能只用 external session id 识别 turn：它可能跨多轮相同。成功 producer 必须提供平台产生的唯一 turn/action correlation；dispatch receipt 绑定 prompt/message id 和对应完成。普通人工输入、迟到旧完成、reviewer 自己 completed、其他 rule 不得意外启动第二条同链。chain owns 其派发 turn；该完成回到 chain handler，不再触发普通起始规则。stop 后的迟到事件保持终态，必须由用户显式重新开启新 chain。

持久化 chain/round/decision/action-intent 与 receipt（同一规则系统的执行状态）。唯一键保障每 request 一个 decision、每 causal completion 一次状态迁移；事务锁/CAS 防重复和 stop 竞争。发送前先落 action-intent；action 状态分 pending/dispatching/sent/settled/uncertain。重启仅恢复明确 pending 且仍合法的动作；已收到 decision/已 sent 不重发。

现 ACP send 不证明跨崩溃 exactly-once。崩溃发生于 send 与 receipt 之间时进入 recovery_uncertain 并停止自动派发，展示待用户核对；不能宣称自动安全重放。可从现有 message/turn receipt 确认后再由用户恢复，保留原 action id、iteration/depth。dispatching 已发生的调用不声称可撤销；stop 线性化后不准许新派发，UI 明示可能已有运行中的 agent，可另调用既有 cancel。

Existing target offline 时只允许按原 external_id/agent_type/folder 恢复同一 conversation；backend 不能保证身份时 exit(target_unavailable)。busy/deleted/禁止目标立即 failed/stopped 并记录，不自动排队、转原 worker或 spawn。reviewer 未出决定、decision 格式错误、reviewer error/cancel 均可见终止。正在运行不因静默文本猜退出；用户 stop 始终可用。未来 budget/status predicate 接相同 hard guard 入口。

日志必须保存原 reviewer 决定、解析目标、轮次/depth、guard verdict、effective action/exit、发送 receipt 和时间；即使 CONTINUE 被硬覆盖仍保留 requested=continue/effective=exit/reason=max_iterations。复用 event_rule_log 读取界面并扩展 chain 关联，不建立第二个规则服务。

## Risks / Trade-offs

- 专用 tool 的实际 Cursor/Codex/ACP 注入必须通过 capability 验收；不承诺所有 backend 自动支持。
- 严格 JSON 比自然语言可靠但仍可能格式失败，失败即停止，不能悄悄继续。
- 确定性恢复优先，发送结果未知时需要用户核对；V1 不承诺端到端 exactly-once。

## Migration Plan

先交付 settled-success producer、stable resolver、durable chain/decision receiver 和 capability；Existing reviewer 最小验收可先跑。再接 AutomationConfig New target，最后实验模板。所有新模板默认关闭；禁用保留日志。Wake Scheduler 独立，不是阻塞依赖。本轮仅设计。

### Current product boundary and exact guards (2026-09-06)

Phase 1 does not expose reviewer chain fields in EventRuleEditor. Completion forwarding to an existing conversation is the available primitive; reviewer decisions remain a later consumer of the same send/read executor.

The allowed-target policy is snapshotted at chain creation as explicit conversation ids and/or an opted-in folder scope plus the source/current worker allowance. Every dispatch revalidates the target identity and policy; policy narrowing, deletion or out-of-scope targets STOP without fallback or spawn. `max_iterations` starts at completed=0 and increments exactly once for each unique reviewer turn that settles successfully, including a settled turn with a missing decision (which then STOPs). ACP error/cancel and duplicate completion do not increment it. Before every automatic dispatch, `next_depth = depth + 1` MUST satisfy `next_depth <= max_chain_depth`. Hard guards save requested/effective decision and override reason.
# Light-loop boundary and policy contract

The current product uses a light A→B→A loop: a settled completion rule sends
the source task, recent valid user message, and current final report to the
reviewer; the reviewer may use authorized read/send tools to request a follow-
up. Heavy `automation_decision` orchestration is future work. Reviewer target
policy is a frozen explicit conversation allowlist or opted-in folder scope,
plus the source/current conversation. Each dispatch revalidates that snapshot
against the target row and stops on policy narrowing, deletion, or mismatch.

`max_iterations` counts settled successful reviewer turns once. A missing or
invalid decision increments that settled count and then STOPs; ACP failure,
cancel, and duplicate completion do not increment. A hard guard may override
CONTINUE, but logs both requested and effective decisions and the override
reason.

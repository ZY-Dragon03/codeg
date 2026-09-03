# Tasks（路线图 — 协调子 change，非直接编码）

## 阶段一

- [ ] S1.1 完成 `event-lifecycle-bus`
- [ ] S1.2 完成 `action-target-spawn-resume`（至少 `source_conversation`）
- [ ] S1.3 完成 `turn-failed-auto-resume`
- [ ] S1.4 验收：模拟 TLS RetriableError → 自动「继续」≤3 次

## 阶段二

- [ ] S2.1 完成 `agent-wake-scheduler`
- [ ] S2.2 验收：长命令 exit → 原会话 wake；30min timer → wake

## 阶段三

- [ ] S3.1 完成 `event-automation-spawn-agent`
- [ ] S3.2 完成 `experiment-audit-handoff`
- [ ] S3.3 验收：实验→review→resume 闭环 + chain_depth 上限

## 阶段三完成后

- [ ] STOP — 不启动 `automation-extensions-*` 除非新开 Phase 2 路线图

## 1. Template integration

- [ ] 1.1 复用通用 chain 元数据和 decision contract，验证不创建第二套 handler/计数器。
- [ ] 1.2 交付可编辑五问模板和本轮 context，验证新建快照与已有 reviewer follow-up 严格区分。
- [ ] 1.3 接 scope/reviewer/candidate selector，验证选 existing B 保存 DB id 而非 agent type。

## 2. Acceptance

- [ ] 2.1 实机验证 E70 补 ablation 后 EXIT，保存消息/决定/终态证据。
- [ ] 2.2 实机验证 A->B REROUTE、B 完成回 reviewer、下一 CONTINUE 指 B，验证未隐式 spawn。
- [ ] 2.3 验证第三轮 CONTINUE 被 max_iterations 覆盖，日志同时含原决定和退出原因。
- [ ] 2.4 使用 Existing reviewer 重跑并验证无 Initial Prompt 重发，以及 stop/缺决定时无后续任务。

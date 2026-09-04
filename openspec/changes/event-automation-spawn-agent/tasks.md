# Tasks

- [ ] 1.1 抽取 `fire_composer_snapshot(config, context)` 共用函数
- [ ] 1.2 Rule editor：spawn 动作 + Composer 字段
- [ ] 1.3 「从 Automation 导入」
- [ ] 1.4 先独立交付 settled-success turn_completed producer 和唯一 turn/action correlation，验证失败不发布成功、重复不引发新链；reviewer core 与 spawn 共用，唯一 producer 归本任务
- [ ] 1.5 验收：turn_completed → cg-review 新会话 + Initial Prompt

- [ ] 1.6 验证 launch envelope 与 AutomationConfig 字段实际恢复、target policy 和持久化 spawn receipt；model/mode/effort 以运行证据验收。
- [ ] 1.7 与 reviewer-controlled-handoff 集成 New/Existing UI，验证 Existing 不调用 spawn、不重发 Initial Prompt。

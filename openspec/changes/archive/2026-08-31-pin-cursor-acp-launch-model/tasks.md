# 任务

- [x] 抽出 Cursor 启动模型解析：覆盖 `model` 优先于 `CURSOR_MODEL`；去掉括号后缀
- [x] Cursor 引擎（含自定义）启动时在 `acp` 前插入 `--model`
- [x] 目标为 Composer 时跳过 Effort 类会话覆盖
- [x] 单元测试：解析、启动参数、Composer 跳过 Effort
- [x] 设置页按当前模型隐藏 Effort
- [x] 前端测试：选 Composer 不显示 Effort，选 Grok 显示

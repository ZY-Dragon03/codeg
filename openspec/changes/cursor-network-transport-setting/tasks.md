# Tasks

## 1. Schema 扩展

- [ ] 1.1 在 Backend Settings Schema 增加 `network.http_version`（映射 `useHttp1ForAgent`）
- [ ] 1.2 定义全局默认与 per-agent 覆盖合并规则

## 2. 持久化与应用

- [ ] 2.1 设置保存时写入 Cursor structured config / cli-config
- [ ] 2.2 spawn 路径只读已保存配置，删除 `ensure_cursor_http1_for_launch`

## 3. UI

- [ ] 3.1 设置页 Cursor 网络传输区块（含说明：缓解 TLS/HTTP2 问题）
- [ ] 3.2 自定义 Cursor 工人 per-agent 覆盖入口

## 4. 验证

- [ ] 4.1 测试：未配置时不写 cli-config
- [ ] 4.2 测试：开启后 spawn 使用 HTTP/1.1
- [ ] 4.3 文档：从 fork 迁移说明

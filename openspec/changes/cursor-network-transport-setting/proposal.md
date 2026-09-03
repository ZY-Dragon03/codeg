# Cursor 网络传输设为用户可配置项

## Why

为缓解 cursor-agent 出站 TLS / HTTP/2 握手失败，当前 fork 在每次启动前强制写入 `network.useHttp1ForAgent=true` 到 cli-config。这是启动时副作用、不可见、不可撤销的技术债，且混在连接逻辑里。网络传输策略属于**智能体设置**，应与其他 Cursor 选项一样由用户显式配置并持久化。

## What Changes

- 在 Codeg 设置中增加 **网络传输** 配置面（至少：默认 HTTP 版本、可选代理提示），归属 Cursor 后端或其全局网络分组。
- 配置通过**正式设置通道**写入（与现有 Cursor structured config / cli-config 集成），而非 `connection` 层每次 spawn 前偷偷改写。
- 启动 cursor-agent 时**读取**用户已保存值；未配置时保持 cursor-agent 出厂默认，不隐式覆盖。
- 提供迁移说明：曾依赖 fork 强制 HTTP/1.1 的用户可在设置中显式开启等价选项。
- 移除 `ensure_cursor_http1_for_launch` 类启动侧 hack（在实现本 change 时）。

## Capabilities

### New Capabilities

- `agent-network-transport-settings`: 智能体网络传输（HTTP 版本等）的用户设置与持久化

### Modified Capabilities

- （无 — 当前主 spec 未覆盖网络传输）

## Impact

- `src-tauri/src/commands/acp.rs` — Cursor settings 解析与应用
- 设置页 Cursor / 自定义 Cursor 后端区块
- `src-tauri/src/acp/connection.rs` — 删除启动前强制写 cli-config
- 与 `custom-agent-settings-parity` 共享「后端设置 schema」机制

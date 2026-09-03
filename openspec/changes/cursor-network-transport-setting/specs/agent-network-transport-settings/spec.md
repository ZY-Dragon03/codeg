## Purpose

让用户在 Codeg 设置中显式配置 Cursor 智能体的网络传输选项（如 HTTP/1.1），而非在连接层每次启动时隐式改写 cli-config。

## ADDED Requirements

### Requirement: 用户可配置 Cursor 网络传输选项

系统 MUST 在设置 UI 中提供 Cursor 后端的网络传输配置项，并持久化用户选择。

#### Scenario: 用户开启 HTTP/1.1

- **WHEN** 用户在 Cursor 网络设置中启用 HTTP/1.1 for agent
- **THEN** 系统 MUST 将等价配置写入 Cursor structured config / cli-config
- **THEN** 后续 cursor-agent 启动 MUST 使用该已保存配置

#### Scenario: 用户未配置时保持出厂行为

- **WHEN** 用户未设置网络传输覆盖
- **THEN** 系统 MUST NOT 在 spawn 前隐式写入 `useHttp1ForAgent`
- **THEN** cursor-agent MUST 使用其自身默认网络行为

### Requirement: 自定义 Cursor 智能体可覆盖网络传输设置

系统 MUST 允许基于 Cursor 后端的自定义智能体继承全局 Cursor 网络设置或定义 per-agent 覆盖。

#### Scenario: 单工人覆盖 HTTP 版本

- **WHEN** 自定义 Cursor 工人设置了 per-agent 网络覆盖
- **THEN** 仅该工人启动时 MUST 应用该覆盖

### Requirement: 连接层不得偷偷改写 cli-config

系统 MUST NOT 在 ACP 连接建立路径中每次启动前无条件写入网络传输配置。

#### Scenario: 建立 Cursor 连接

- **WHEN** 用户未保存 HTTP/1.1 设置
- **THEN** `connection` spawn 路径 MUST NOT 调用强制写入 cli-config 的逻辑

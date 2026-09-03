## Context

见 `proposal.md`。Fork 在 `ensure_cursor_http1_for_launch` 每次 spawn 前写 `~/.cursor/cli-config.json`。用户无法在 Codeg UI 查看或关闭；且与其他 Cursor 设置脱节。

## Goals / Non-Goals

**Goals:**

- 网络传输选项进入 **Backend Settings Schema**（`custom-agent-settings-parity`）
- 读写走现有 `parse_cursor_settings` / `apply_cursor_structured_config` 或等价持久化层
- 全局默认 + 每智能体覆盖（与 model 覆盖模式一致）

**Non-Goals:**

- 不实现通用系统代理管理（仍依赖 OS / cursor-agent 自身）
- 不在 connection spawn 路径写文件

## Decisions

### 1. 设置键命名

**决定**：`network.useHttp1ForAgent` 作为 schema 中 `network.http_version` 的 UI 友好别名，保存时映射到 cursor-agent 认识的 structured config 键。

### 2. 应用时机

**决定**：用户保存设置时写入持久存储；下次 spawn **只读**。不在每次连接时 merge 默认值以免覆盖用户手动编辑的 cli-config。

### 3. 作用域

**决定**：Cursor 后端级 schema 字段；自定义 Cursor 智能体继承并可 per-agent 覆盖。

**备选**：全局「所有智能体 HTTP/1.1」— 拒绝，仅 Cursor 相关。

## Risks / Trade-offs

- [cursor-agent 升级改键名] → schema 版本字段 + 迁移映射表
- [TLS 错误非 HTTP 版本唯一原因] → 文档说明；诊断页链到网络设置而非承诺根治

## Migration Plan

1. UI + 持久化先上线，默认「未设置 / 跟随 cursor-agent」
2. 删除 `ensure_cursor_http1_for_launch`
3. 文档：曾用 fork 的用户可手动开启 HTTP/1.1

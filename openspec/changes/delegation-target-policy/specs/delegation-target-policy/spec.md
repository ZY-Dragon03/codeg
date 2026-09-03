## Purpose

在启用委派之外，提供可配置的目标白名单、黑名单与权限等级约束，防止越权委派与权限弹窗泛滥。

## ADDED Requirements

### Requirement: 每个智能体声明委派权限等级

系统 MUST 为每个可委派目标智能体声明 `delegation_tier`（数值或命名等级），并在 registry 与设置 UI 中可查看。

#### Scenario: 查看工人等级

- **WHEN** 用户在智能体列表查看 `cdx-explore`
- **THEN** 系统 MUST 显示其委派等级（如 restricted / standard）

### Requirement: 委派方只能派给符合策略的目标

系统 MUST 在启动委派前校验委派策略，包括白名单、黑名单与等级约束。

#### Scenario: Codex 白名单仅允许 cdx-explore

- **WHEN** Codex 的委派策略白名单为 `[cdx-explore]`
- **AND** 主会话尝试委派给 `cg-implement`
- **THEN** 系统 MUST 拒绝委派并返回明确错误原因
- **THEN** 系统 MUST NOT 启动目标工人进程

#### Scenario: 等级约束禁止派给更高等级

- **WHEN** 委派方等级为 `standard` 且策略为「仅同级及以下」
- **AND** 目标工人等级为 `full`
- **THEN** 系统 MUST 拒绝委派

#### Scenario: 黑名单优先

- **WHEN** 目标在黑名单中
- **THEN** 系统 MUST 拒绝委派，即使其在白名单中

### Requirement: 用户可编辑委派策略

系统 MUST 在设置页提供委派策略编辑界面，支持配置白名单、黑名单与等级规则。

#### Scenario: 用户添加白名单条目

- **WHEN** 用户将 `cdx-explore` 加入 Codex 委派白名单并保存
- **THEN** 后续仅允许向白名单内目标委派（当白名单非空时）

### Requirement: 预设可携带推荐委派策略

系统 MUST 支持后端预设在创建自定义智能体时写入推荐的委派策略种子，用户可后续修改。

#### Scenario: 从探索型预设创建

- **WHEN** 用户从「探索」类预设创建工人
- **THEN** 系统 MAY 预填较低的 `delegation_tier` 与保守白名单建议

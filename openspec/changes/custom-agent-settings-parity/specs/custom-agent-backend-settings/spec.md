## Purpose

使基于 Cursor/Codex 等后端的自定义智能体拥有与内置工人相同的可配置设置面，包括权限模式、模型选项与 launch 注入。

## ADDED Requirements

### Requirement: 自定义智能体继承后端完整设置 schema

系统 MUST 为每个 `backend_id` 声明设置 schema，并对绑定该后端的自定义智能体渲染与内置工人等价的设置表单字段。

#### Scenario: 自定义 Cursor 工人显示权限设置

- **WHEN** 用户编辑 `custom:cg-explore`（Cursor 后端）
- **THEN** 设置页 MUST 展示与内置 Cursor 工人相同的权限相关选项（如 Run Everything / full access 等等价项）

#### Scenario: 自定义 Codex 工人显示模型与审批设置

- **WHEN** 用户编辑基于 Codex 预设的自定义工人
- **THEN** 设置页 MUST 展示 Codex schema 定义的模型与审批相关字段，MUST NOT 仅显示 Skill/MCP 开关

### Requirement: 设置必须在 spawn 时注入 launch 或 structured config

系统 MUST 将用户保存的权限与 launch 阶段选项在启动工人进程时注入，而非仅在主会话生效。

#### Scenario: Run Everything 对委派工人生效

- **WHEN** 用户为自定义 Cursor 工人启用 Run Everything（或等价权限模式）
- **THEN** 该工人被委派启动时 MUST 带上对应 launch 标志（如 `--force`）
- **THEN** 工人 MUST NOT 因缺少该配置而反复弹出与主会话不一致的权限确认

### Requirement: 委派默认与工人设置共享键空间

系统 MUST 使 `delegation.agent_defaults` 与 per-agent 设置使用同一 schema 键名与语义。

#### Scenario: 委派默认中的 model 与工人设置一致

- **WHEN** 委派默认与工人面板均设置 `model`
- **THEN** 系统 MUST 按统一优先级规则解析，MUST NOT 出现两套不兼容键名

## MODIFIED Requirements

### Requirement: Cursor 引擎工人按指定模型启动

系统必须在启动 Cursor 引擎工人（含自定义工人）时，若存在指定模型，则在进程参数中带上该模型。模型来源 MUST 包含工人设置 schema 中的 `model` 字段与委派默认，经统一 launch 构建器解析，MUST NOT 仅在 connection 对特定 slug 硬编码注入。

#### Scenario: 委派默认是 Composer 2.5

- **WHEN** `cg-explore` 的委派默认模型为 `composer-2.5`
- **THEN** 该工人第一轮对话使用 Composer 2.5

#### Scenario: 未指定模型时保持出厂

- **WHEN** 该 Cursor 引擎工人没有模型覆盖
- **THEN** 系统 MUST NOT 额外附加模型启动参数

#### Scenario: 非 Cursor 引擎不受影响

- **WHEN** 工人是 Codex 等非 Cursor 引擎
- **THEN** 系统 MUST NOT 带上 Cursor 的模型启动参数

### Requirement: Composer 上不展示、不套用 Effort

当用户当前选择的模型属于 Composer 家族时，设置页不得展示 Effort；开工时不得把 Effort 覆盖套到该会话。规则 MUST 由 backend schema 驱动，MUST NOT 由前端组件硬编码 Composer 判断。

#### Scenario: 设置页选 Composer 2.5

- **WHEN** 用户将模型覆盖设为 Composer 2.5
- **THEN** 设置页 MUST NOT 出现 Effort 行

#### Scenario: 设置页选回 Grok 4.6

- **WHEN** 用户将模型覆盖改为 Grok 4.6
- **THEN** Effort 行 MUST 重新出现

#### Scenario: 保存值残留 Effort 但目标是 Composer

- **WHEN** 覆盖同时含 `model=composer-2.5` 与 Effort
- **THEN** 系统 MUST NOT 把 Effort 套到该会话

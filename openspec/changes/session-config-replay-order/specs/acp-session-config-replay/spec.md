## Purpose

为所有 ACP 智能体后端提供可声明、可测试的会话偏好评项回放顺序与冲突校验，避免 map 迭代顺序导致模型与档位错乱。

## ADDED Requirements

### Requirement: 配置回放必须遵循后端选项依赖顺序

系统 MUST 根据智能体后端的选项 schema 确定偏好评项的应用顺序，MUST NOT 依赖键名字母序或无序 map 迭代顺序。

#### Scenario: Cursor 先应用 model 再应用 effort

- **WHEN** 委派默认同时包含 `model` 与 `effort`
- **THEN** 系统 MUST 先应用 `model` 再应用 `effort`

#### Scenario: 拓扑依赖无法满足时报告错误

- **WHEN** 某选项声明依赖尚未应用的键
- **THEN** 系统 MUST 延后该选项或返回可观测错误，MUST NOT 静默以错误顺序应用

### Requirement: 回放前必须剔除与目标模型冲突的选项

系统 MUST 在应用偏好评项前，根据当前生效模型族剔除 schema 标记为不兼容的选项。

#### Scenario: Composer 目标跳过 Effort

- **WHEN** 生效模型属于 Composer 家族且保存值含 `effort`
- **THEN** 系统 MUST 跳过 `effort` 的应用并记录诊断信息

### Requirement: 委派默认、面板设置与会话重连共用同一回放器

系统 MUST 通过同一回放编排服务处理委派启动、工人设置保存后会话重连三条路径。

#### Scenario: 委派启动与设置页保存结果一致

- **WHEN** 用户对同一工人保存委派默认后直接委派任务
- **THEN** 实际会话选项 MUST 与按同一 schema 回放保存值的结果一致

## MODIFIED Requirements

### Requirement: Cursor 引擎工人按指定模型启动

系统必须在启动 Cursor 引擎工人（含自定义工人）时，若存在指定模型，则在进程参数中带上该模型，而不是先按出厂模型开会话再改。模型与相关 launch 阶段选项 MUST 通过 launch 阶段回放编排解析，而非 connection 层零散特殊分支。

#### Scenario: 委派默认是 Composer 2.5

- **WHEN** `cg-explore` 的委派默认模型为 `composer-2.5`
- **THEN** 该工人第一轮对话使用 Composer 2.5
- **THEN** 系统 MUST NOT 第一轮使用 Grok 4.6 或其他出厂模型

#### Scenario: 未指定模型时保持出厂

- **WHEN** 该 Cursor 引擎工人没有模型覆盖，也没有面板模型设置
- **THEN** 系统 MUST NOT 额外附加模型启动参数

#### Scenario: 非 Cursor 引擎不受影响

- **WHEN** 工人是 Codex 等非 Cursor 引擎
- **THEN** 系统 MUST NOT 带上 Cursor 的模型启动参数

### Requirement: Composer 上不展示、不套用 Effort

当用户当前选择的模型属于 Composer 家族时，设置页不得展示 Effort；开工时不得把 Effort 覆盖套到该会话。展示与跳过规则 MUST 由 backend schema 的 `visibility_when` / `incompatible_with` 驱动。

#### Scenario: 设置页选 Composer 2.5

- **WHEN** 用户将模型覆盖设为 Composer 2.5
- **THEN** 设置页 MUST NOT 出现 Effort 行

#### Scenario: 设置页选回 Grok 4.6

- **WHEN** 用户将模型覆盖改为 Grok 4.6
- **THEN** Effort 行 MUST 重新出现

#### Scenario: 保存值残留 Effort 但目标是 Composer

- **WHEN** 覆盖同时含 `model=composer-2.5` 与某个 Effort 值
- **THEN** 系统 MUST 按 Composer 启动且 MUST NOT 把 Effort 套到该会话

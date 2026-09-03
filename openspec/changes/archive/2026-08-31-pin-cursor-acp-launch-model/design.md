# 设计

## 开工钉死模型

Cursor 引擎只认启动参数 `--model <id>`（写在 `acp` 子命令前面）。会话里再改一次经常赢不过出厂模型。

判定「这是 Cursor 引擎」沿用已有规则：启动配方是 `cursor-agent` 且带 `acp`，不看工人名字。`cg-explore`、`cg-implement`、内置 Cursor 都算。

模型 id 来源（前者优先）：

1. 委派/启动覆盖里的 `model`
2. 内置 Cursor 面板写入的 `CURSOR_MODEL`

保存值可能带括号后缀（例如 `composer-2.5[fast=true]`）。传给 `--model` 时只留括号前的纯 id（`composer-2.5`）。Fast / Effort 仍走会话选项。

Fast 关闭仍用现有会话选项 `fast=false`。因为会话已经在 Composer 上打开，这一步才能生效。

## 套选项时跳过无效档位

目标模型属于 Composer 家族（id 含 `composer`，不分大小写）时，跳过 `effort` / `reasoning_effort` / `thought_level`，避免把探测残留的 Medium 套到 Composer 上。

## 设置页隐藏 Effort

「智能体默认」页的选项来自一次冻结的探测快照。用户改模型下拉时用**当前生效模型**（覆盖优先，否则探测出厂值）过滤：

- Composer 家族：不渲染 Effort 行
- 其他：保持探测到的行

不重探、不改保存值。切回 Grok 时 Effort 行重新出现。

## 不在本次做

- 探测过程本身不套用户覆盖（设置页灰色「智能体默认」仍可能写 Grok，那是出厂值，不是覆盖失败）。
- 非委派、也没带模型覆盖的普通开聊，仍跟 Cursor 出厂模型。本次只保证「写了委派默认」的开工路径。

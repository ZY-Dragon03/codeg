# 钉死 Cursor 工人启动模型，并按模型隐藏无关档位

## 用户目标

用户在「多智能体协同 → 智能体默认」里给 `cg-explore` / `cg-implement` 选了 Composer 2.5，期望委派出去的工人就是 Composer 2.5（Fast 关闭）。当前实际开工会先落成 Cursor 账号的出厂模型（Grok 4.6 Medium），事后再改常常改不回去。设置页在已选 Composer 时仍显示 Effort，造成「Composer 也有思考档」的错觉。

## 前置状态

- `cg-explore` / `cg-implement` 底层是 Cursor 引擎（`cursor-agent … acp`），不是独立产品。
- 委派默认已保存 `model=composer-2.5`、`fast=false`。
- 内置 Cursor 工人可以在启动时带上模型；自定义 Cursor 工人不会。
- 设置页的选项来自一次「空手探测」：探测时引擎出厂是 Grok，就会带出 Effort。改下拉框不会重探。

## 操作

1. 凡是 Cursor 引擎工人（含自定义），只要委派默认或启动配置里指定了模型，**进程一启动就带上该模型**，不要等会话开始后再改。
2. 设置页里，当前选中的模型若是 Composer 家族，**不显示 Effort**。
3. 开工时若目标模型是 Composer，不要再把 Grok 的 Effort 覆盖套上去。

## 期望行为

- 委派 `cg-explore` / `cg-implement` 且默认是 Composer 2.5 时，第一轮对话就是 Composer 2.5，而不是 Grok 4.6。
- 设置页选 Composer 2.5 后看不到 Effort；选回 Grok 4.6 后 Effort 回来。
- Fast 开关在 Composer 上仍可显示（Composer 有 Fast）。
- 内置 Cursor 工人原有启动行为保持：仍可用面板里的模型设置。

## 禁止行为

- 不把 Codex / Claude 等非 Cursor 引擎工人套上 Cursor 启动参数。
- 不在设置页改模型时偷偷改掉已保存的 Effort 值（只隐藏，不删除）。
- 不引入新的数据目录，不改用户已保存的委派默认，除非用户自己再保存。

## 为什么现在做

用户已经把默认钉成 Composer，但工人和设置页仍表现成 Grok。这会让人以为派发坏了，也会让 Composer 工人带上不该有的思考档。

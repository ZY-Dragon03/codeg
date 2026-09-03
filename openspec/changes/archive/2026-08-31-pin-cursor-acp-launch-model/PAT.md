# 产品验收（PAT）

## PAT-1 委派工人用上设置里的 Composer

1. 在多智能体协同里，把 `cg-explore` 和 `cg-implement` 的模型设为 Composer 2.5，Fast 关闭，并保存。
2. 从主会话各委派一条只需回复固定文本的短任务。
3. **通过**：两条工人会话记录里的模型是 Composer 2.5（不是 Grok 4.6，也不是 Composer Fast）。
4. **失败**：第一轮仍是 Grok，或仍带 Fast。

## PAT-2 设置页选 Composer 不再出现 Effort

1. 打开 `cg-explore` 的智能体默认。
2. 把模型下拉改成 Composer 2.5。
3. **通过**：看不到 Effort；看得到 Fast。
4. 把模型改回 Grok 4.6（或智能体默认且出厂是 Grok）。
5. **通过**：Effort 重新出现。

## PAT-3 内置 Cursor 工人没有变差

1. 用内置 Cursor 工人开一聊，面板模型保持原样。
2. **通过**：仍按原来的方式启动，能正常对话。

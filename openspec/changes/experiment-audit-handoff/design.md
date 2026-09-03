## Context

见 `phase-1-event-automation` P1 时序图。

## Goals / Non-Goals

**Goals:** 双规则模板、conversation 链元数据、chain_depth 护栏。

**Non-Goals:** 不自动 merge；reviewer 不自动改代码（prompt 约束）；不做 LLM 判断「是否通过」

## Decisions

- **实验会话识别**：规则 scope `agent_type` 或文件夹级默认 reviewer + experiment agent 配对
- **review → experiment 解析**：spawn 时写入 `rule_run_context.experiment_conversation_id`
- **follow-up 模板**：可配置，默认「根据审计结果重新规划并继续下一轮实验」

## 默认审计 Initial Prompt（模板）

1. 实验设计是否合理  
2. 是否存在数据泄漏  
3. 指标是否可信  
4. 是否应追加实验  
5. 结果不足时给出下一批实验任务  
（不要直接修改代码）

## Migration Plan

阶段三最后集成；验收跑通 E70 类场景

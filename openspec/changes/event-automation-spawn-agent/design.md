## Context

见 `phase-1-event-automation` P0-1。

## Goals / Non-Goals

**Goals:** 事件 → spawn；Config 与 Automation 1:1；可从 Automation 克隆规则。

**Non-Goals:** 阶段一/二不做；不做新 prompt 存储格式。

## Decisions

- **复用 `AutomationConfig`** 序列化，Rule.then.spawn 字段与其相同
- **「从 Automation 导入」**：复制 `config` blob 到 rule，后续独立编辑
- **Initial Prompt** = `prompt_blocks` + `display_text`，文档与 UI 明示

## Migration Plan

阶段三实现；阶段一/二 spawn 动作返回「未实现」若被误配

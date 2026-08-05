# chiff-agent-loop Specification

## Purpose

轻量 Agent 循环引擎，驱动 CHIFF 各 Pass 的 LLM 自主探索。LLM 通过 tool_call 主动获取信息、通过 tool_result 接收结果，自主决定何时输出结构化 JSON。每个 Pass 是独立的 Agent 会话。
## Requirements
### Requirement: Private Eval Agent Loop Prohibition

The Eval coordinator SHALL NOT implement a private LLM/tool loop. Every LLM-dependent CHIEF stage SHALL execute as a standard Agent process through `AgentSupervisor`.

#### Scenario: Eval inference stage starts

- **WHEN** the Eval coordinator starts a graph, oracle, backtracking, attribution, or rule inference stage
- **THEN** it SHALL spawn the stage through `AgentSupervisor`
- **AND** SHALL NOT call a model completion API or execute tools through an Eval-private loop

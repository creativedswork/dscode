# 文档归档

本目录保存历史方案、调研和已完成变更的设计记录，用于追溯决策背景。

> 归档文档不是当前行为的事实来源，其中的依赖版本、文件路径、能力状态、
> API 和 Roadmap 可能已经过期。当前行为以 `openspec/specs/`、代码和
> `docs/` 根目录的权威文档为准。

## 当前权威文档

- [`../ARCHITECTURE.md`](../ARCHITECTURE.md) — 当前 Agent as OS 架构
- [`../AGENT_MD.md`](../AGENT_MD.md) — Agent.md 配置与使用
- [`../STYLE.md`](../STYLE.md) — 当前编码与测试规范
- [`../prototypes/README.md`](../prototypes/README.md) — UI 原型约束

## 归档分类

### implemented/

已实现功能的分析与技术方案。实现后的规范已同步到 `openspec/specs/`，这些文档
只用于解释历史设计过程：

- `implemented/ui/CHAT-TO-DASHBOARD-TRANSITION.md`
- `implemented/eval/CHIFF-ITERATIVE-FOCUSING.md`
- `implemented/eval/eval-recovery-arc-gap.md`
- `implemented/edit-tool-resilience/analysis.md`
- `implemented/edit-tool-resilience/technical-solution.md`

### research/

实施前调研和外部系统分析。部分结论已被后续架构替代：

- `research/subagent/` — Claude Code SubAgent、前置条件和 Prompt Cache 调研
- `research/mcp/mcp-spec-review.md` — MCP 2025-11-25 升级前的兼容性审查

其中旧 SubAgent 文档使用 `AgentDefinition`、`runAgent`、`LocalAgentTask` 等
方案名，当前实现已经采用 `AgentApplication`、`AgentSupervisor`、
`AgentProcess` 和统一 `PiAgentRuntimeAdapter`。

### legacy/

被新的权威文档或 OpenSpec 工作流替代的长期文档：

- `legacy/AGENT_APPLICATIONS.md` — 已合并到 `docs/AGENT_MD.md`
- `legacy/ROADMAP.md` — 状态已过期；当前计划由 active OpenSpec changes 管理
- `legacy/DESIGN.md` — 早期 ADR，包含 readline-only UI 等已失效决策

### 根目录历史文件

`ci-npm-publish-plan.md`、`npm-publish-plan.md`、`integration-report.md`、
`tool-search.md` 和 `tool-search-design.md` 是此前已经归档的发布或 Tool Search
材料，保留原路径以减少历史链接变动。

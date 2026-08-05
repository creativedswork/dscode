# 历史调研

本目录内容记录实施前的外部系统研究和方案推演，**不是当前 dscode 行为说明**。

- `subagent/SubAgent前置条件分析.md` 描述 SubAgent 尚未实现时的能力缺口；
- `subagent/SubAgent技术方案.md` 主要逆向 Claude Code，使用的
  `AgentDefinition/runAgent/LocalAgentTask` 不是当前 dscode 架构；
- `subagent/deepseek-prompt-cache.md` 与
  `subagent/Fork-SubAgent-缓存影响分析.md` 是 Fork 方案的缓存研究，当前
  `context_mode=fork` 仍被 evaluation gate 禁用；
- `mcp/mcp-spec-review.md` 是升级前审查，其中“固定 2024-11-05、仅旧 SSE”
  等结论已不符合当前实现。

当前事实请查阅：

- [`../../ARCHITECTURE.md`](../../ARCHITECTURE.md)
- [`../../AGENT_MD.md`](../../AGENT_MD.md)
- `openspec/specs/`

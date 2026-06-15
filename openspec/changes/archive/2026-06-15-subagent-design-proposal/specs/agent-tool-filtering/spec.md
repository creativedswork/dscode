## ADDED Requirements

### Requirement: 多层过滤架构
系统 SHALL 通过 `filterToolsForAgent()` 函数实现多层工具过滤，维度包括：
- 全局禁用（`ALL_AGENT_DISALLOWED_TOOLS`）
- 自定义代理禁用（`CUSTOM_AGENT_DISALLOWED_TOOLS`）
- 异步代理限制（`ASYNC_AGENT_ALLOWED_TOOLS`）
- MCP 工具始终放行

过滤优先级 SHALL 为：MCP 工具放行 → 全局禁用检查 → 自定义禁用检查 → 异步限制检查。

#### Scenario: MCP 工具优先
- **WHEN** 工具名为 `mcp__slack__send_message` 且该工具在禁用列表中
- **THEN** 该工具仍被放行（MCP 工具不受禁用列表限制）

#### Scenario: 全局禁用
- **WHEN** 子代理尝试使用 `Agent` 工具（在 `ALL_AGENT_DISALLOWED_TOOLS` 中）
- **THEN** 该工具被过滤掉，子代理无法调用

### Requirement: 通配符支持
代理定义的 `tools` 字段 SHALL 支持 `["*"]` 通配符，表示可使用所有非禁用工具。

`disallowedTools` 在 `tools: ["*"]` 时 SHALL 正常生效，排除指定工具。

#### Scenario: 通配符 + 黑名单
- **WHEN** 代理定义 `tools: ["*"], disallowedTools: ["Bash(git push*)"]`
- **THEN** 代理可使用除 `Bash(git push*)` 外的所有工具

### Requirement: 异步代理工具限制
异步代理 SHALL 仅允许使用 `ASYNC_AGENT_ALLOWED_TOOLS` 中的工具，排除交互式工具。

允许的异步工具 MUST 包括：Bash（非交互式）、Read、Write、Edit、Grep、Glob、WebFetch、WebSearch 等。

#### Scenario: 异步代理无法交互
- **WHEN** 异步代理尝试使用 `AskUserQuestion` 工具
- **THEN** 该工具被过滤掉，因为不在 `ASYNC_AGENT_ALLOWED_TOOLS` 中

### Requirement: resolveAgentTools 工具解析
系统 SHALL 提供 `resolveAgentTools()` 函数，将代理定义的工具规格解析为实际工具列表。

解析逻辑 SHALL：
- 通配符 `*`：返回过滤后的全部可用工具
- 显式列表：仅返回列表中指定的工具
- `Agent(x, y)` 语法：解析出 `allowedAgentTypes` 限制

#### Scenario: Agent(x, y) 语法
- **WHEN** 代理定义 `tools: ["Agent(code-reviewer, test-runner)"]`
- **THEN** 解析出 `allowedAgentTypes: ["code-reviewer", "test-runner"]`，该代理仅能调用这两种子代理

### Requirement: 内置 vs 自定义代理差异
内置代理 SHALL 仅受 `ALL_AGENT_DISALLOWED_TOOLS` 限制；自定义代理 SHALL 额外受 `CUSTOM_AGENT_DISALLOWED_TOOLS` 限制。

#### Scenario: 自定义代理额外限制
- **WHEN** 自定义代理尝试使用某仅内置代理可用的工具
- **THEN** 该工具被 `CUSTOM_AGENT_DISALLOWED_TOOLS` 过滤

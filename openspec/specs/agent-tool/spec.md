## ADDED Requirements

### Requirement: AgentTool 工具调用
系统 SHALL 提供 `Agent` 工具（别名 `Task`），允许主 Agent 通过标准工具调用协议委派任务给子代理。

工具输入参数 SHALL 包含：
- `description`（必填）：3-5 个词的任务简述
- `prompt`（必填）：给子代理的详细任务指令
- `subagent_type`（可选）：指定子代理类型，省略时使用默认代理
- `model`（可选）：模型覆写（sonnet/opus/haiku）
- `run_in_background`（可选）：是否后台执行
- `isolation`（可选）：隔离模式（worktree/remote）

#### Scenario: 同步调用子代理
- **WHEN** 主 Agent 调用 `Agent({description: "search auth code", prompt: "找出所有认证相关代码", subagent_type: "Explore"})`
- **THEN** 系统启动 Explore 子代理，阻塞主 Agent，等待子代理完成后返回结果

#### Scenario: 异步调用子代理
- **WHEN** 主 Agent 调用 `Agent({description: "refactor utils", prompt: "重构 utils 目录", run_in_background: true})`
- **THEN** 系统立即返回 `{status: "async_launched", agentId, outputFile}`，子代理在后台运行

#### Scenario: 省略 subagent_type 触发 Fork
- **WHEN** Fork 功能开启且主 Agent 调用 `Agent({description: "audit branch", prompt: "审计分支状态"})` 未指定 `subagent_type`
- **THEN** 系统创建继承父代理上下文的 Fork 子代理

### Requirement: AgentTool 输出格式
AgentTool 的输出 SHALL 根据执行模式返回不同格式。

同步模式 SHALL 返回 `{status: "completed", content, totalToolUseCount, totalDurationMs}`。
异步模式 SHALL 返回 `{status: "async_launched", agentId, description, outputFile, canReadOutputFile}`。

#### Scenario: 同步完成的输出
- **WHEN** 同步子代理成功完成
- **THEN** 返回包含完整响应内容和统计信息的 completed 状态

#### Scenario: 异步启动的输出
- **WHEN** 异步子代理启动
- **THEN** 返回 async_launched 状态，包含 agentId 和输出文件路径

### Requirement: 代理类型筛选
系统 SHALL 根据权限规则和 MCP 服务器可用性筛选可用的代理类型。

代理筛选规则 SHALL 包括：
- 被权限规则 `Agent(agentName)` 拒绝的代理不可见
- 定义了 `requiredMcpServers` 但相应 MCP Server 无可用工具的代理不可见

#### Scenario: MCP 依赖未满足
- **WHEN** 代理定义 `requiredMcpServers: ["slack"]` 但 Slack MCP Server 未连接
- **THEN** 该代理不出现在可用代理列表中，调用时抛出错误

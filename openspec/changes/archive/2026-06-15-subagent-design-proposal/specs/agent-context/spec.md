## ADDED Requirements

### Requirement: AsyncLocalStorage 上下文存储
系统 SHALL 使用 Node.js `AsyncLocalStorage` 存储当前代理上下文，确保并发代理的上下文互不干扰。

代理上下文类型 SHALL 包括：
- `SubagentContext`：Agent Tool 子代理（`agentType: "subagent"`）
- `TeammateAgentContext`：群组成员代理（`agentType: "teammate"`）

#### Scenario: 并发代理隔离
- **WHEN** Agent A 和 Agent B 同时在同一进程中运行
- **THEN** Agent A 的 `getAgentContext()` 返回 A 的上下文，Agent B 返回 B 的上下文

### Requirement: SubagentContext 结构
`SubagentContext` SHALL 包含以下字段：
- `agentId`：子代理 UUID
- `parentSessionId`：父会话 ID（undefined 表示主 REPL）
- `agentType`：固定值 "subagent"
- `subagentName`：代理类型名（如 "Explore"）
- `isBuiltIn`：是否为内置代理
- `invokingRequestId`：触发此次调用的 API 请求 ID
- `invocationKind`：调用类型（"spawn" 或 "resume"）

#### Scenario: SubagentContext 初始化
- **WHEN** 子代理通过 AgentTool 启动
- **THEN** SubagentContext 包含正确的 agentId、parentSessionId、subagentName

### Requirement: runWithAgentContext
系统 SHALL 提供 `runWithAgentContext(context, fn)` 函数，在给定的代理上下文中执行异步函数。

#### Scenario: 上下文传递
- **WHEN** 调用 `runWithAgentContext(ctx, async () => { ... await someAsyncOp(); getAgentContext(); })`
- **THEN** 异步操作内部通过 `getAgentContext()` 获取到正确的上下文

### Requirement: getAgentContext
系统 SHALL 提供 `getAgentContext()` 函数返回当前代理上下文，不在代理上下文中时返回 `undefined`。

#### Scenario: 主线程无上下文
- **WHEN** 在主 REPL 线程中调用 `getAgentContext()`
- **THEN** 返回 `undefined`

#### Scenario: 子代理线程有上下文
- **WHEN** 在运行中的子代理内部调用 `getAgentContext()`
- **THEN** 返回该子代理的 SubagentContext

### Requirement: 分析归因
系统 SHALL 使用代理上下文实现分析事件归因，`getSubagentLogName()` 返回用于日志的代理名称（内置代理返回类型名，自定义代理返回 "user-defined"）。

`consumeInvokingRequestId()` SHALL 在每次代理调用中仅返回一次调用请求 ID。

#### Scenario: 分析事件归属
- **WHEN** Explore 子代理发起 API 调用
- **THEN** 对应的 `tengu_api_success` 事件携带 `subagentName: "Explore"` 和正确的 invoking request ID

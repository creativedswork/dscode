## ADDED Requirements

### Requirement: AgentContext 表示进程执行环境

系统 SHALL 使用 `AgentContext` 表示当前 Agent 进程的执行环境。上下文 MUST 包含 `agentId`、`parentAgentId`、`parentSessionId`、`applicationName`、`role`、`attachment`、`cwd` 和 `depth`。

#### Scenario: 子进程上下文
- **WHEN** Main Agent 从 Session S 启动 Explore Agent
- **THEN** 子进程上下文包含新的 agentId、Main Agent agentId 作为 parentAgentId、S 作为 parentSessionId

### Requirement: AsyncLocalStorage 隔离

系统 SHALL 使用 Node.js `AsyncLocalStorage` 传播 AgentContext，确保并发 Agent 的身份与 cwd 互不覆盖。

#### Scenario: 并发进程隔离
- **WHEN** Agent A 和 Agent B 并行执行异步工具调用
- **THEN** A 内部获取 A 的 AgentContext，B 内部获取 B 的 AgentContext

### Requirement: Main Agent 使用同一上下文模型

Main Agent SHALL 拥有 role 为 `main`、无 parentAgentId、depth 为 0 的 AgentContext。系统 MUST NOT 仅为 SubAgent 建立特殊上下文模型。

#### Scenario: Main Agent 上下文
- **WHEN** Main Agent 执行工具
- **THEN** 工具可读取 Main Agent 的 agentId、parentSessionId 和 cwd

### Requirement: 并发安全 cwd

文件、Shell、Checkpoint 和路径相关工具 SHALL 从 AgentContext 获取 cwd。SubAgent MUST NOT 调用 `process.chdir()` 修改全局工作目录。

#### Scenario: Worktree 与主工作区并行
- **WHEN** Agent A 在主工作区运行且 Agent B 在 Worktree 运行
- **THEN** 两者解析同一相对路径时得到各自 cwd 下的不同绝对路径

### Requirement: 进程上下文 API

系统 SHALL 提供 `runWithAgentContext(context, fn)` 和 `getAgentContext()`。所有 AgentRuntime 启动入口 MUST 使用 `runWithAgentContext` 包裹。

#### Scenario: 异步链传播
- **WHEN** runWithAgentContext 内经过多个 await 后调用 getAgentContext
- **THEN** 返回原始 AgentContext

### Requirement: 日志与事件归因

Logger、HarnessEventBus、Usage 和工具事件 SHALL 携带当前 agentId、parentAgentId 与 applicationName。日志 tag MUST 使用 PascalCase 常量。

#### Scenario: 子进程工具事件
- **WHEN** reviewer Agent 调用 grep
- **THEN** tool event 可归因到 reviewer 的 agentId，而不是 Main Agent

### Requirement: 上下文不作为权限来源

AgentContext SHALL 携带已编译 capability 的引用，但权限决策 MUST 由 PermissionManager 执行。调用方不得通过伪造 context 字段提升权限。

#### Scenario: 伪造 Application 名
- **WHEN** 工具参数中包含高权限 applicationName
- **THEN** PermissionManager 仍使用 Supervisor 创建的不可变 AgentContext

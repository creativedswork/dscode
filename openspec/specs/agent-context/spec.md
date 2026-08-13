# agent-context Specification

## Purpose

Define Agent Process context together with the Kernel-owned Execution Context
ABI used for concurrent identity, cwd, Host attribution, and Driver isolation.
## Requirements
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

文件、Shell、Checkpoint、Logger 和路径相关 Adapter SHALL 从 Kernel Execution
Context 获取 cwd 与执行归因。SubAgent MUST NOT 调用 `process.chdir()` 修改全局
工作目录，Driver MUST NOT 读取 Agent Process Table 或 PCB。

#### Scenario: Worktree 与主工作区并行
- **WHEN** Agent A 在主工作区运行且 Agent B 在 Worktree 运行
- **THEN** 两者解析同一相对路径时得到各自 Execution Context cwd 下的不同绝对路径
- **AND** Driver 不需要知道 AgentProcess 的具体结构

#### Scenario: 非 Agent 调用 Driver

- **WHEN** 测试或受信 Application 在没有 AgentContext 时调用 Driver
- **THEN** Adapter SHALL 使用显式 Execution Context 或已定义的安全 fallback

### Requirement: 进程上下文 API

系统 SHALL 提供 Kernel-owned `runWithExecutionContext(context, fn)` 和
`getExecutionContext()`。Main Agent 与 SubAgent Runtime 入口 MUST 绑定对应进程
的不可变 Execution Context。

#### Scenario: 异步链传播
- **WHEN** runWithExecutionContext 内经过多个 await 后调用 getExecutionContext
- **THEN** 返回原始不可变执行上下文

#### Scenario: Agent Process 绑定上下文

- **WHEN** AgentSupervisor 启动 Main Agent 或 SubAgent Runtime
- **THEN** Runtime 入口 SHALL 绑定对应 Execution Context
- **AND** Kernel ABI SHALL 不依赖 Agent Runtime、Driver 或 Presentation

### Requirement: Execution Context is a Kernel ABI

Execution Context SHALL contain跨 Driver 与 Service 所需的最小 Host、Process、
Session、Application 和 cwd 身份。Agent-specific capability、attachment、
parent/depth 和 Worktree 状态 SHALL remain in AgentContext.

#### Scenario: Driver resolves a path

- **WHEN** FS、Shell、Search 或 Edit Driver 解析相对路径
- **THEN** 它 SHALL 只依赖 Kernel Execution Context accessor

#### Scenario: Logger adds attribution

- **WHEN** Logger 在已绑定上下文中记录工作
- **THEN** 它 SHALL 附加可用的 Host 与 Process 归因
- **AND** SHALL not import Agent Process implementation modules

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

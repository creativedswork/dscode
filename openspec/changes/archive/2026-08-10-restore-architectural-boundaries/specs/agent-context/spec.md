## MODIFIED Requirements

### Requirement: 并发安全 cwd

文件、Shell、Checkpoint、Logger 和路径相关 Adapter SHALL 从 Kernel
Execution Context ABI 获取当前 cwd 与进程身份。SubAgent MUST NOT 调用
`process.chdir()` 修改全局工作目录，Driver MUST NOT import AgentSupervisor 或
`agents/process` 的具体实现来解析上下文。

#### Scenario: Worktree 与主工作区并行
- **WHEN** Agent A 在主工作区运行且 Agent B 在 Worktree 运行
- **THEN** 两者解析同一相对路径时得到各自 Execution Context cwd 下的不同绝对路径
- **AND** Driver 不需要知道 AgentProcess 的具体结构

#### Scenario: 非 Agent 调用 Driver
- **WHEN** 测试或其他受信 Application 调用 Driver 且没有绑定 AgentContext
- **THEN** Adapter SHALL 使用显式提供的 Execution Context 或已定义的安全 fallback
- **AND** fallback 行为 SHALL 可独立测试

### Requirement: 进程上下文 API

系统 SHALL 提供 Kernel-owned `runWithExecutionContext(context, fn)` 和
`getExecutionContext()` ABI。Agent Process 启动入口 SHALL 将不可变 AgentContext
适配并绑定到该 ABI；迁移期 MAY 保留旧函数名的兼容 re-export。

#### Scenario: 异步链传播
- **WHEN** runWithExecutionContext 内经过多个 await 后调用 getExecutionContext
- **THEN** 返回原始不可变执行上下文

#### Scenario: Agent Process 绑定上下文
- **WHEN** AgentSupervisor 启动 Main Agent 或 SubAgent Runtime
- **THEN** 它 SHALL 在 Runtime 入口绑定对应进程的 Execution Context
- **AND** Kernel ABI SHALL 不依赖 Agent Runtime、Driver 或 Presentation

## ADDED Requirements

### Requirement: Execution Context is a Kernel ABI
Execution Context SHALL contain跨 Driver/Service 所需的最小执行身份，例如
`processId`、`parentProcessId`、`sessionId`、`application` 和 `cwd`。Agent-specific
capability、Runtime、transcript 和 lifecycle state MUST remain in Agent Process-owned
types rather than the generic ABI.

#### Scenario: Driver resolves a path
- **WHEN** FS、Shell、Search 或 Edit Driver 解析相对路径
- **THEN** 它 SHALL 只依赖 Kernel Execution Context accessor
- **AND** 它 SHALL 不读取 Agent Process Table 或 PCB

#### Scenario: Logger adds attribution
- **WHEN** Logger records work under a bound execution context
- **THEN** it SHALL attach available process attribution
- **AND** Logger SHALL not import Agent Process implementation modules

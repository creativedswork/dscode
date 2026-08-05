## ADDED Requirements

### Requirement: Main Agent TTY 重绑定

Session 切换时，AgentSupervisor SHALL 更新 Main Agent Process 的
`parentSessionId` 和 AgentContext，并在返回成功前将新值持久化到 Agent Process
Store。

#### Scenario: Main Agent 从 A 切换到 B
- **WHEN** 统一切换事务要求 Main Agent 重绑定 Session B
- **THEN** Main Agent 的内存 Process、AgentContext 和持久化 Process 记录均指向 B

### Requirement: Main 重绑定失败回滚

AgentSupervisor MUST 在重绑定持久化失败时恢复 Main Agent Process 原有的
`parentSessionId` 和 AgentContext，并向调用方传播错误。

#### Scenario: Process Store 写入失败
- **WHEN** Main Agent 从 A 重绑定 B 时 Process Store 持久化失败
- **THEN** Main Agent 的内存 Process 和 AgentContext 恢复指向 A，Session B 不得 commit

### Requirement: 已有子进程归属不可变

Main Agent TTY 重绑定 MUST NOT 修改已经创建的 SubAgent Process、
AgentContext、Process Store 记录或 pending notification 路由键。

#### Scenario: Background Agent 跨越切换
- **WHEN** Agent X 在 Session A 创建且在 Main Agent 切换到 B 后继续运行
- **THEN** X 的 parentSessionId 始终为 A，完成通知和退出记录仍路由到 A

#### Scenario: Foreground Agent 在切换前中止
- **WHEN** 当前 Main turn 的 foreground SubAgent 尚未结束且开始 Session 切换
- **THEN** 切换流程先中止并等待该执行终结，不得把它重绑定到目标 Session

### Requirement: 新子进程继承当前 Main 归属

AgentSupervisor 创建 SubAgent 时 SHALL 从 Main Agent Process 的当前
`parentSessionId` 派生子进程上下文。该创建 MUST 由 load 之后的独立任务调用
触发，Session load 本身 MUST NOT 调用 AgentSupervisor.spawn。

#### Scenario: 后续独立任务触发 spawn
- **WHEN** Main Agent 已完成到 Session B 的重绑定，随后由新任务启动 SubAgent
- **THEN** 新 SubAgent 的 parentSessionId 为 B，parentAgentId 仍为 Main Agent ID

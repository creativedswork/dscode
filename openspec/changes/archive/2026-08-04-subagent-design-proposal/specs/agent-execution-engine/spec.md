## ADDED Requirements

### Requirement: Agent 是统一进程实体

系统 SHALL 使用同一 Agent 领域模型表示 Main Agent 与 SubAgent。每个 Agent MUST 拥有 agentId、Application、AgentContext、AgentProcessRuntime、进程状态和 attachment。

#### Scenario: Main 与 SubAgent 同构
- **WHEN** 检查 Main Agent 和 Explore SubAgent
- **THEN** 两者均由同一 Agent 类型表示，仅 role、PID/PPID、Application 和 capability 不同

### Requirement: PiAgentRuntime Adapter

系统 SHALL 将 `pi-agent-core.Agent` 作为 `PiAgentRuntime` 使用，并 SHALL 通过 PiAgentRuntimeAdapter 实现 AgentProcessRuntime。PiAgentRuntime SHALL 负责模型、消息和工具循环，但 MUST NOT 取代领域 Agent 的进程身份与生命周期。

#### Scenario: Runtime 创建
- **WHEN** AgentSupervisor 启动 runtime=agent 的子进程
- **THEN** 新 Agent 持有独立 PiAgentRuntimeAdapter，且进程元数据不存放在 PiAgentRuntime 全局状态中

### Requirement: AgentSupervisor 与 Process Table

系统 SHALL 提供 AgentSupervisor 作为唯一进程创建和状态变更入口，并 SHALL 维护 Agent Process Table。

Process Table MUST 至少记录 agentId、parentAgentId、parentSessionId、applicationName、applicationSource、applicationDigest、registryGeneration、state、attachment、cwd、createdAt、updatedAt、usage 和 exit result。

#### Scenario: 创建子进程
- **WHEN** Main Agent 启动 reviewer
- **THEN** Supervisor 分配唯一 agentId，并在 Process Table 中记录 Main Agent 为父进程

### Requirement: Main Agent 为 PID 1

Harness 初始化 SHALL 通过 AgentSupervisor 创建 Main Agent。Main Agent SHALL 是当前 Harness 生命周期中的根进程，parentAgentId SHALL 为空且 role SHALL 为 main。

#### Scenario: Harness 初始化
- **WHEN** Harness 完成 initialize
- **THEN** Process Table 中存在且仅存在一个根 Main Agent

### Requirement: AgentProcessRuntimeFactory

系统 SHALL 使用统一 AgentProcessRuntimeFactory 从不可变 Application snapshot 创建 PiAgentRuntimeAdapter。所有 Main Agent 与 SubAgent MUST 使用该执行链，MVP 不提供 Application 专用 PipelineRuntime。

Factory SHALL 复用允许共享的 model registry、Driver definitions、MCP connections、Logger 和 EventBus，并 SHALL 隔离 runtime state、messages、ContextManager、ToolRegistry discovery、PermissionManager grants、AbortController 和 Usage。

#### Scenario: 工具发现隔离
- **WHEN** 子进程通过 search_tools 发现一个 MCP 工具
- **THEN** Main Agent 的 discovered tool set 不发生变化

#### Scenario: Vision Runtime
- **WHEN** AgentSupervisor 启动 Bundled vision Application
- **THEN** Factory 创建与其他 SubAgent 相同的 PiAgentRuntimeAdapter，并应用 Vision snapshot 的 Prompt、model 和空 capability

### Requirement: Agent fallback 执行策略

AgentProcessRuntime 返回可恢复失败时，Supervisor SHALL 在进程进入终态前按 Application snapshot 解析 fallback。Fallback 成功 SHALL 完成同一 AgentProcess；全部 fallback 失败后 Agent 才可进入 failed。

#### Scenario: OCR 恢复 Vision
- **WHEN** Vision PiAgentRuntime 返回 model_error 且 Application 声明对应 OCR fallback
- **THEN** Supervisor 在同一 agentId 下执行 OcrFallbackHandler，并记录主执行与恢复阶段

### Requirement: Agent 进程状态机

Agent state SHALL 遵循：

```text
created -> running
running <-> waiting
running -> stopped -> running
running|waiting|stopped -> exited|failed|killed
```

终态 MUST 不可逆。

#### Scenario: 失败终结
- **WHEN** AgentProcessRuntime 以不可恢复错误结束
- **THEN** Agent 状态变为 failed，保存错误和退出结果，后续不得回到 running

### Requirement: Foreground 执行

foreground 启动 SHALL 等待同一 Agent 进程进入终态并返回结构化 AgentExitResult。

#### Scenario: 同步 Explore
- **WHEN** Main Agent foreground 启动 explore
- **THEN** spawn 工具等待 explore 退出并返回其结果、Usage 和 agentId

### Requirement: Background 执行

background 启动 SHALL 在进程进入 running 后立即返回 agentId。AgentProcessRuntime MUST 在同一进程实例中继续运行。

#### Scenario: 后台不重启
- **WHEN** foreground Agent 被切换为 background
- **THEN** agentId、AgentProcessRuntime、runtime state 和已完成工作保持不变

### Requirement: 同轮并行启动

`spawn_agent` SHALL 允许 pi-agent-core 按 parallel tool execution 并行执行多个独立启动。Supervisor MUST 保证 Process Table 更新并发安全。

#### Scenario: 并行探索
- **WHEN** Main Agent 在同一 assistant message 中调用两个 spawn_agent
- **THEN** 两个 Agent 可并行运行且拥有独立上下文和结果

### Requirement: Agent Process Store

系统 SHALL 将子进程元数据、Application snapshot、messages 和退出结果保存到独立版本化 AgentProcessStore。子进程 MUST NOT 通过 `SessionManager.current` 持久化。

#### Scenario: Session 列表不污染
- **WHEN** 一个用户 Session 启动五个 SubAgent
- **THEN** 普通 Session 列表仍只包含该用户 Session，Process Store 包含五个子进程记录

### Requirement: 运行进程配置不可变

Agent SHALL 在启动时固定 applicationSource、applicationDigest、registryGeneration 和编译后的 snapshot。Registry 热更新 MUST NOT 原地修改运行进程。

#### Scenario: 配置热更新可追溯
- **WHEN** Agent 使用 generation 4 启动后 Registry 更新到 generation 5
- **THEN** Process Table 和 Store 仍记录该 Agent 使用 generation 4 及对应 digest

### Requirement: Session 作为 TTY

Agent SHALL 通过 parentSessionId 关联用户 Session。Session 删除或 Harness shutdown 时，Supervisor SHALL 按进程 attachment 和关闭策略发送终止信号。

#### Scenario: 后台进程关联
- **WHEN** 后台 Agent 完成
- **THEN** 退出事件路由到其 parentSessionId，不创建新的用户 Session

### Requirement: 父 Session 的通用 Agent 关联记录

子进程退出时，系统 SHALL 在 parentSessionId 对应 Session 的顶层 `agentMessages` 中写入通用记录。记录 MUST 包含 `role: "subagent"`、agentId、parentAgentId、Application、状态、输入、输出和时间戳。完整子进程 transcript SHALL 继续保存在 AgentProcessStore，且 MUST NOT 混入 Main Agent 的 `messages` 推理上下文。

#### Scenario: Vision Agent 完成
- **WHEN** Vision Agent 完成图片分析
- **THEN** 父 Session 的 `agentMessages` 包含该 Agent 的通用记录和图片 Attachment 引用
- **AND** Session 不写入新的 `visionMessages`

#### Scenario: 旧 Session 兼容
- **WHEN** 加载带有 `visionMessages` 的版本 2 Session
- **THEN** 系统在内存中将其转换为通用 `agentMessages`
- **AND** 下次保存时写为版本 3

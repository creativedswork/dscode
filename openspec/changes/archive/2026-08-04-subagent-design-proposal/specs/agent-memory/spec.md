## ADDED Requirements

### Requirement: Memory 属于 Application

持久 Memory SHALL 按 AgentApplication name 组织，而不是按单次 agentId 组织。多个同 Application 进程 SHALL 读取同一作用域 Memory。

#### Scenario: Reviewer 共享项目记忆
- **WHEN** 两个 reviewer Agent 在同一项目依次启动
- **THEN** 两者读取同一 reviewer project memory

### Requirement: dscode 原生 Memory 路径

系统 SHALL 使用：

- user：`~/.dscode/agent-memory/<application>/MEMORY.md`
- project：`<project>/.dscode/agent-memory/<application>/MEMORY.md`
- local：`<project>/.dscode/agent-memory-local/<application>/MEMORY.md`

系统 MUST NOT 将 `.claude` 作为 dscode 原生写入路径。

#### Scenario: Project Memory
- **WHEN** Application 声明 `memory: project`
- **THEN** MemoryManager 从 `.dscode/agent-memory/<application>/MEMORY.md` 加载

### Requirement: Claude memory 字段兼容

Claude Code Application 中的 `memory: user|project|local` SHALL 映射到 dscode 对应作用域。兼容只改变路径实现，不改变字段语义。

#### Scenario: Claude 项目记忆
- **WHEN** `.claude/agents/reviewer.md` 声明 `memory: project`
- **THEN** 编译后的 AgentApplication 使用 dscode project memory namespace

### Requirement: Memory 注入

Application Memory SHALL 在进程启动时注入 systemPrompt 的独立区段，并 SHALL 标注 Application 和作用域。

#### Scenario: 启动时注入
- **WHEN** reviewer project Memory 包含安全检查规则
- **THEN** reviewer Agent systemPrompt 包含该规则和 project scope 标识

### Requirement: Memory 写权限

Memory 更新 SHALL 经过正常 PermissionManager。只读 Application MUST NOT 因声明 memory 而自动获得写权限。

#### Scenario: Explore 更新 Memory
- **WHEN** 只读 explore Agent 尝试写 Memory
- **THEN** 写入被权限层拒绝

### Requirement: 并发 Memory 更新

多个同 Application Agent 并发更新 Memory 时，系统 SHALL 使用版本检查或原子更新防止静默覆盖。

#### Scenario: 并发冲突
- **WHEN** 两个 reviewer 基于同一旧版本写入不同内容
- **THEN** 至少一个写入收到版本冲突，不得静默覆盖

### Requirement: Memory 延后实现诊断

在 per-application Memory 尚未实现的阶段，加载带 memory 字段的 Application SHALL 产生 unsupported 诊断，系统 MUST NOT 静默忽略。

#### Scenario: MVP 读取 Memory 配置
- **WHEN** MVP 启动声明 memory 的 Application
- **THEN** 启动失败或要求用户显式允许降级，并展示尚未实现诊断

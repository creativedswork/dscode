## ADDED Requirements

### Requirement: Agent cwd 属于进程环境

每个 Agent SHALL 在 AgentContext 中拥有独立 cwd。所有文件与 Shell 工具 SHALL 相对该 cwd 解析路径。

#### Scenario: 独立 cwd
- **WHEN** 两个 Agent 使用不同 cwd 同时读取 `package.json`
- **THEN** 两个工具调用读取各自 cwd 下的文件

### Requirement: 禁止子进程修改全局 cwd

SubAgent MUST NOT 调用 `process.chdir()`。任何需要切换目录的行为 SHALL 通过新 AgentContext 或工具参数实现。

#### Scenario: 并发目录切换
- **WHEN** 一个 Agent 切换到子目录执行任务
- **THEN** 其他 Agent 的路径解析不受影响

### Requirement: Worktree 隔离

系统 SHALL 支持为 Agent 创建 Git Worktree。Worktree 路径 SHALL 位于 `.dscode/worktrees/agent-<agentId-prefix>/`，不得使用 `.claude` 作为原生存储路径。

#### Scenario: 创建 Worktree
- **WHEN** spawn_agent isolation 为 worktree
- **THEN** AgentContext.cwd 指向新的 Worktree，主工作区文件不被直接修改

### Requirement: Background 写进程强制 Worktree

background Agent 的最终 capability 包含写工具时，Supervisor SHALL 强制 isolation 为 worktree 或拒绝启动。

#### Scenario: 拒绝未隔离写进程
- **WHEN** background Agent 可写且请求 isolation none
- **THEN** spawn 失败并返回明确诊断

### Requirement: Worktree 生命周期

Agent 退出后，系统 SHALL 检查 Worktree：

- 无变更：自动清理；
- 有变更：保留并在 AgentExitResult 中返回路径、分支和基线 commit；
- killed 或 failed：默认保留有变更 Worktree。

#### Scenario: 无变更清理
- **WHEN** Worktree Agent 正常退出且没有 Git 变更
- **THEN** Worktree 和临时分支被清理

### Requirement: 并发写冲突控制

系统 SHALL 禁止多个未隔离 Agent 并发写同一主工作区。最终合并 Worktree 变更 SHALL 由 Main Agent 串行执行。

#### Scenario: 两个写 Agent
- **WHEN** Main Agent 并行启动两个写 Application
- **THEN** 两者获得独立 Worktree，不能直接写主工作区

### Requirement: Checkpoint namespace 隔离

Checkpoint、文件版本和 anchor invalidation 状态 SHALL 按 agentId 与 cwd 隔离。

#### Scenario: 同一路径不同 Worktree
- **WHEN** 两个 Worktree Agent 修改相同相对路径
- **THEN** Checkpoint 和文件版本记录分别归属各自 agentId

### Requirement: Worktree 恢复校验

checkpoint restore 使用 Worktree 时 SHALL 校验路径、Git root、基线 commit 和当前占用状态。校验失败 MUST 停止恢复，不得回退到主工作区写入。

#### Scenario: Worktree 已删除
- **WHEN** checkpoint 指向不存在的 Worktree
- **THEN** restore 失败并返回隔离环境丢失错误

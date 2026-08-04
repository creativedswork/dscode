# agent-progress-notification Specification

## Purpose
TBD - created by archiving change subagent-design-proposal. Update Purpose after archive.
## Requirements
### Requirement: Agent 生命周期事件

系统 SHALL 通过 HarnessEventBus 发布 `agent:spawned`、`agent:state`、`agent:progress`、`agent:output` 和 `agent:exit`。

每个事件 MUST 包含 agentId、parentAgentId、parentSessionId 和 applicationName。

#### Scenario: 进程启动事件
- **WHEN** Supervisor 成功启动 Agent
- **THEN** 系统发布 agent:spawned，随后发布 running 状态

### Requirement: 结构化进度

系统 SHALL 追踪工具调用数、输入/输出 Token、耗时、当前活动和最近活动。进度数据 SHALL 与 agentId 绑定。

#### Scenario: 工具调用进度
- **WHEN** Agent 完成一次 read_file
- **THEN** toolUseCount 增加，recentActivities 记录 read_file 和目标路径

### Requirement: AgentExitResult

每个终态 Agent SHALL 产生 AgentExitResult，至少包含 agentId、applicationName、exitStatus、summary、output、usage、startedAt、endedAt、durationMs、artifacts、worktreePath 和 error。

#### Scenario: 正常退出
- **WHEN** Agent 成功完成任务
- **THEN** exitStatus 为 completed，output 和 usage 被持久化并随 agent:exit 发布

#### Scenario: 强制终止
- **WHEN** Agent 被 kill
- **THEN** exitStatus 为 killed，结果包含终止原因

### Requirement: Foreground 结果回传

foreground Agent 的 AgentExitResult SHALL 作为 `spawn_agent` 工具结果直接返回父 Agent。

#### Scenario: Foreground 完成
- **WHEN** Explore Agent 完成
- **THEN** Main Agent 当前工具调用获得结构化结果而不是仅获得 UI 通知

### Requirement: Background 退出通知

background Agent 退出时，系统 SHALL 立即通知 UI，并 SHALL 将结构化退出通知加入 parentSessionId 的 pending notification queue。

#### Scenario: Main Agent 忙碌时完成
- **WHEN** 后台 Agent 在 Main Agent 另一轮运行期间退出
- **THEN** UI 显示完成状态，退出通知在下一个安全上下文注入点进入 Main Agent

### Requirement: 默认不自动唤醒 Main Agent

MVP 中后台退出 MUST NOT 自动对空闲 Main Agent 发起新的模型请求。通知 SHALL 在下一用户轮次或已有 Agent Loop 的安全 follow-up 点注入。

#### Scenario: 空闲时完成
- **WHEN** Main Agent 已空闲且后台 Agent 完成
- **THEN** UI 展示结果但不自动产生新的 LLM 调用

### Requirement: 进程输出可查询

AgentProcessStore SHALL 保存最新进度、已产生输出和终态结果，使 `get_agent_output` 在 Agent 运行中和退出后均可读取。

#### Scenario: 运行中查询
- **WHEN** Main Agent 查询尚未完成的后台 Agent
- **THEN** 返回 running、当前进度和截至当前的输出，不伪造最终结果

### Requirement: 父 Session 路由

通知 SHALL 按 parentSessionId 路由。切换当前 UI Session MUST NOT 把某个 Agent 的退出结果注入错误会话。

#### Scenario: 用户切换 Session
- **WHEN** Session A 的后台 Agent 在 UI 当前显示 Session B 时完成
- **THEN** 通知保存到 Session A，Session B 不接收该上下文

### Requirement: Agent 生命周期 UI snapshot

UI adapter SHALL 将 Agent 生命周期事件归一化为完整 `agent_activity` snapshot。
Snapshot MUST 从 AgentSupervisor 的当前 Process 和事件结果构建，不得要求前端聚合
内部 Process 状态。

#### Scenario: Spawned 事件投影
- **WHEN** AgentSupervisor 发布 agent:spawned
- **THEN** UI adapter 发布 state=running 的 agent_activity snapshot
- **AND** snapshot 包含 parentSessionId、Application 和 attachment

#### Scenario: Progress 事件投影
- **WHEN** AgentSupervisor 发布 agent:progress
- **THEN** UI adapter 发布同一 agentId 的 snapshot，并携带 phase、进度或消息

#### Scenario: Exit 事件投影
- **WHEN** AgentSupervisor 发布 agent:exit
- **THEN** UI adapter 发布终态 snapshot，并携带 endedAt、output 或 error

### Requirement: Agent UI snapshot Session 过滤

UI adapter MUST 在发送 Agent Activity 前比较 Agent Process 的 parentSessionId 与
当前可见 Session。不同 Session 的事件 MUST NOT 广播到当前 conversation。

#### Scenario: 当前 Session 的 Agent 更新
- **WHEN** Agent parentSessionId 等于当前 Session ID
- **THEN** UI adapter 向当前客户端发送 agent_activity

#### Scenario: 非当前 Session 的 Agent 更新
- **WHEN** background Agent parentSessionId 与当前 Session ID 不同
- **THEN** UI adapter 不向当前 conversation 发送 agent_activity
- **AND** Agent 终态仍按 parentSessionId 持久化供未来恢复

### Requirement: Agent UI snapshot 去重

UI adapter SHALL 避免对状态和进度均未变化的连续事件重复发送相同 snapshot。

#### Scenario: 相同 progress 重复到达
- **WHEN** 同一 Agent 连续产生内容相同的 progress snapshot
- **THEN** adapter MAY 丢弃后续重复 snapshot
- **AND** 不影响最终 exit snapshot 的发送

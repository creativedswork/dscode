## ADDED Requirements

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

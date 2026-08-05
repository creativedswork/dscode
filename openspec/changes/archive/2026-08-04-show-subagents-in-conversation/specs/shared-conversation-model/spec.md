## ADDED Requirements

### Requirement: Canonical AgentActivity type

共享 UI 模块 SHALL 定义 canonical `AgentActivity`，包含 agentId、parentAgentId、
parentSessionId、Application、attachment、Agent state、输入、输出、错误、进度和
时间信息。该类型 MUST 为纯 TypeScript 数据结构，不依赖 DOM、Node API 或 Runtime。

#### Scenario: Running Agent Activity
- **WHEN** UI 接收 running Agent snapshot
- **THEN** `AgentActivity` 包含 agentId、parentSessionId、application、attachment、state 和 input

#### Scenario: Completed Agent Activity
- **WHEN** UI 接收 completed Agent snapshot
- **THEN** `AgentActivity` 包含 endedAt、可选 output，且可以计算 duration

### Requirement: UIMessage 支持 Agent role

canonical `UIMessage` SHALL 支持 `role: "agent"`，并在该 role 下携带
`agentActivity`。Agent role MUST 与 user、assistant 和 system role 可判别。

#### Scenario: Agent UI message
- **WHEN** reducer 创建 Agent Activity 消息
- **THEN** 消息 role 为 agent、agentActivity.agentId 有值
- **AND** 消息不被解释为 assistant response

### Requirement: Reducer upsert Agent Activity

`conversationReducer` SHALL 处理 `agent_activity` ServerEvent，并按 agentId
不可变地插入或更新 Agent UIMessage。

#### Scenario: 首次 Activity snapshot
- **WHEN** reducer 收到未知 agentId 的 `agent_activity`
- **THEN** 返回数组追加一条 role=agent 的 UIMessage

#### Scenario: 后续 Activity snapshot
- **WHEN** reducer 收到已存在 agentId 的 `agent_activity`
- **THEN** 替换该 UIMessage 的 agentActivity snapshot
- **AND** 其他消息与原输入数组保持不变

#### Scenario: 重复终态 snapshot
- **WHEN** reducer 两次收到同一 agentId 的相同 completed snapshot
- **THEN** conversation 中仍只有一条对应 Agent UIMessage

### Requirement: Ready 恢复 Agent Activity

`ready` 事件中的 `ConversationMessage[]` SHALL 支持 Agent Activity，并由 reducer
恢复为 canonical UIMessage。

#### Scenario: Session ready 包含 Agent Activity
- **WHEN** ready messages 中包含 role=agent 的记录
- **THEN** reducer 保留 agentActivity 的状态、输出和时间字段
- **AND** 不把该记录转换为 assistant role

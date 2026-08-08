## ADDED Requirements

### Requirement: Agent Tool progress 使用稳定 identity

SubAgent Runtime SHALL 为 Tool execution start/end 发布结构化 Agent progress。每个
Tool progress MUST 包含 executionId、toolCallId、toolName、Tool 状态和时间信息。

#### Scenario: Tool execution start
- **WHEN** PiAgentRuntimeAdapter 接收 `tool_execution_start`
- **THEN** 系统发布 status=running 的 Agent Tool progress
- **AND** executionId 等于当前 Agent Process identity
- **AND** toolCallId 等于 Runtime Tool Call identity

#### Scenario: Tool execution end
- **WHEN** PiAgentRuntimeAdapter 接收 `tool_execution_end`
- **THEN** 系统使用相同 executionId 和 toolCallId 发布 completed 或 failed progress
- **AND** progress 包含 isError 与 endedAt

#### Scenario: 并行 Tool
- **WHEN** 同一 SubAgent 同时执行两个 Tool Call
- **THEN** 两个 Tool Activity 使用不同 toolCallId 独立更新
- **AND** 一个 Tool 完成不得覆盖另一个 Tool 的 running 状态

### Requirement: Agent Permission progress 绑定 Execution

SubAgent Permission prompt SHALL 发布带 executionId 的结构化 Agent progress，并
SHALL 在 Permission 解决后发布 resolution。

#### Scenario: Permission prompt 开始
- **WHEN** SubAgent PermissionManager 请求用户批准 bash
- **THEN** 系统发布 phase=permission、status=waiting 的 Agent progress
- **AND** progress 包含 agentId/executionId、toolName 与 preview

#### Scenario: Permission prompt 结束
- **WHEN** 用户允许或拒绝 Permission
- **THEN** 系统发布 status=resolved 的 Permission progress
- **AND** UI 可从对应 Execution 清除 prompt

### Requirement: Agent Tool timeline snapshot 去重

UI adapter SHALL 按 executionId 与 toolCallId 合并 Tool lifecycle，并 SHALL 避免相同
状态的重复 progress 产生重复 Tool row。

#### Scenario: 重复 Tool start
- **WHEN** adapter 连续收到同一 toolCallId 的相同 running progress
- **THEN** Agent Activity 中仅保留一条 Tool Activity

#### Scenario: Tool 完成后 Agent exit
- **WHEN** Tool completed progress 后收到 Agent exit
- **THEN** 终态 Agent Activity 保留已完成 Tool timeline
- **AND** exit snapshot 不删除或复制 Tool row

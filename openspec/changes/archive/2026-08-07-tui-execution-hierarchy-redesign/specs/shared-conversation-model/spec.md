## ADDED Requirements

### Requirement: Canonical AgentToolActivity type

共享 UI 模块 SHALL 定义纯 TypeScript `AgentToolActivity`，至少包含 toolCallId、name、
status、startedAt，并 MAY 包含 summary、endedAt 和 isError。该类型 MUST 不依赖
Runtime、DOM 或 Node API。

#### Scenario: Running Tool Activity
- **WHEN** shared projector 接收 Tool start progress
- **THEN** `AgentToolActivity` 包含 toolCallId、name、status=running 和 startedAt

#### Scenario: Failed Tool Activity
- **WHEN** shared projector 接收 isError=true 的 Tool end progress
- **THEN** 同一 `AgentToolActivity` 更新为 status=failed
- **AND** 包含 endedAt 与 isError=true

### Requirement: AgentActivity 支持 Execution details

Canonical `AgentActivity` SHALL 支持可选 executionId、tools 和 permission 字段。
`tools` MUST 为 `AgentToolActivity[]`；permission MUST 至少包含 toolName 与 preview，
并 MAY 包含 toolCallId。

#### Scenario: Execution snapshot
- **WHEN** UI 接收包含 SubAgent Tool lifecycle 的 snapshot
- **THEN** AgentActivity.executionId 标识所属执行
- **AND** AgentActivity.tools 包含按开始时间稳定排序的 Tool Activity

#### Scenario: 兼容旧 Activity
- **WHEN** ready payload 中的旧 Agent Activity 不含 executionId、tools 或 permission
- **THEN** shared model 仍接受并恢复该 Activity
- **AND** consumer 将 agentId 作为 execution identity fallback

### Requirement: Agent Activity projector 合并 Tool identity

AgentActivityProjector SHALL 按 agentId/executionId 和 toolCallId 不可变地 upsert Tool
Activity，并 SHALL 在后续 state/output/exit snapshot 中保留已聚合 timeline。

#### Scenario: 首次 Tool progress
- **WHEN** Projector 收到未知 toolCallId 的 running progress
- **THEN** snapshot 新增一条 Tool Activity

#### Scenario: 后续 Tool progress
- **WHEN** Projector 收到已知 toolCallId 的 completed progress
- **THEN** snapshot 替换对应 Tool Activity
- **AND** 其他 Tool Activity 保持不变

### Requirement: Execution projection 不进入模型上下文

Execution、Tool Activity、Permission disclosure 与折叠状态 SHALL 仅存在于
display-ready UI projection。系统 MUST NOT 将其追加到 Main Agent messages。

#### Scenario: 构建下一轮 Main context
- **WHEN** 当前 TUI 展示包含 SubAgent Tool timeline 与 Permission history
- **THEN** 下一轮 Main model context 不包含这些 UI projection 字段
- **AND** 仅使用原有 Main transcript 与安全通知注入

# agent-activity-display Specification (Delta)

## MODIFIED Requirements

### Requirement: Web Permission 归属 Agent Activity

Web SHALL 将带可识别 `agentId` 或 `toolCallId` 的 SubAgent Permission 显示在独立
统一审批卡片中，并标注来源 Agent。无法归属到 SubAgent Activity 的 Permission MUST
回退到独立交互控件，不得丢弃审批请求。Agent Activity Card MUST NOT 因待审批请求而
强制展开 Tool timeline 或锁定「Hide tools / Show tools」开关。

#### Scenario: Permission 归属 SubAgent
- **WHEN** SubAgent 的 Tool Activity 与 Permission 具有相同 `toolCallId` 或 `agentId`
- **THEN** Web 在统一审批卡片中显示该 Permission 并标注来源 Agent
- **AND** 该 Permission 不在 Agent Activity Card 内原位渲染

#### Scenario: Agent Activity Card 不因审批而锁定
- **WHEN** 某 Agent Activity 存在待审批 Permission
- **THEN** 该 Agent Activity Card 的 Tool timeline 保持用户当前的展开/折叠状态
- **AND** 「Show tools / Hide tools」开关仍可用，不因审批而禁用

### Requirement: TUI 紧凑展示

TUI SHALL 使用与 Web 相同的 Agent Activity 数据语义，并 SHALL 将 Activity 渲染为
独立 Execution Card。Card MUST 显示用户可见角色 label、状态、耗时、输入摘要、Tool
summary 和终态结果摘要。完整 Tool timeline、Permission 与 result detail SHALL 通过
owner-aware Activity Inspector 访问；Card 内的摘要 MUST NOT 成为独立权威数据副本。

#### Scenario: TUI Agent 运行
- **WHEN** TUI 当前 Session 中的 SubAgent 正在运行 Tool
- **THEN** 对话区域显示该 Agent 的 running 状态、耗时和当前 Tool
- **AND** Tool 显示在 Agent Card 内
- **AND** `Ctrl+E` 打开 Inspector 时自动定位该 active Agent Tool

#### Scenario: TUI Agent 完成
- **WHEN** TUI 当前 Session 中的 SubAgent 完成
- **THEN** 原 Agent Card 更新为 completed
- **AND** 默认折叠 Tool timeline并显示结果摘要，而不只显示 toast
- **AND** Inspector 仍可按 agentId/toolCallId 访问已投影详情

#### Scenario: TUI Agent 等待授权
- **WHEN** TUI 当前 Session 中的 SubAgent Tool 等待 Permission
- **THEN** 原 Agent Card 更新为 waiting
- **AND** 统一权限面板显示 Permission options，Tool timeline 不强制展开
- **AND** Permission panel 获得最高输入优先级并显示 Agent/Tool owner path

#### Scenario: TUI Agent 在 Inspector 打开期间更新
- **WHEN** selected Agent Activity 收到 progress、output 或 exit snapshot
- **THEN** Card 与 Inspector 原位更新
- **AND** Inspector selection 和用户 disclosure state 不得重置

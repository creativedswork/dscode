## ADDED Requirements

### Requirement: Agent Activity 包含 Tool timeline

Agent Activity SHALL 可选地包含 executionId、Tool Activity timeline 和当前 Permission。
每个 Tool Activity MUST 至少包含 toolCallId、toolName、状态和开始时间。

#### Scenario: Tool start 更新 Activity
- **WHEN** SubAgent 发布带 toolCallId 的 Tool start progress
- **THEN** 原 Agent Activity 增加一条 running Tool Activity
- **AND** 不创建第二个 Agent Card

#### Scenario: Tool end 更新 Activity
- **WHEN** 同一 toolCallId 发布 Tool end progress
- **THEN** 原 Tool Activity 原位更新为 completed 或 failed
- **AND** 保存 endedAt 与 error 状态

#### Scenario: Permission 绑定 Activity
- **WHEN** SubAgent Tool 进入 Permission prompt
- **THEN** Agent Activity 携带当前 Permission summary
- **AND** Permission resolution 后该 summary 被清除

## MODIFIED Requirements

### Requirement: TUI 紧凑展示

TUI SHALL 使用与 Web 相同的 Agent Activity 数据语义，并 SHALL 将 Activity 渲染为
独立 Execution Card。Card MUST 显示用户可见角色 label、状态、耗时、输入摘要、Tool
summary 和终态结果摘要。TUI SHALL 支持折叠 Tool timeline，并 SHALL 在展开时显示
已投影的 Tool Activity 与当前 Permission。

#### Scenario: TUI Agent 运行
- **WHEN** TUI 当前 Session 中的 SubAgent 正在运行 Tool
- **THEN** 对话区域显示该 Agent 的 running 状态、耗时和当前 Tool
- **AND** Tool 显示在 Agent Card 内

#### Scenario: TUI Agent 完成
- **WHEN** TUI 当前 Session 中的 SubAgent 完成
- **THEN** 原 Agent Card 更新为 completed
- **AND** 默认折叠 Tool timeline并显示结果摘要，而不只显示 toast

#### Scenario: TUI Agent 等待授权
- **WHEN** TUI 当前 Session 中的 SubAgent Tool 等待 Permission
- **THEN** 原 Agent Card 更新为 waiting
- **AND** Tool timeline 强制展开并原位显示 Permission options

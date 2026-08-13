## MODIFIED Requirements

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
- **AND** Tool timeline 强制展开并原位显示 Permission options
- **AND** Permission panel 获得最高输入优先级并显示 Agent/Tool owner path

#### Scenario: TUI Agent 在 Inspector 打开期间更新
- **WHEN** selected Agent Activity 收到 progress、output 或 exit snapshot
- **THEN** Card 与 Inspector 原位更新
- **AND** Inspector selection 和用户 disclosure state 不得重置

### Requirement: Agent Activity 包含 Tool timeline

Agent Activity SHALL 可选地包含 executionId、Tool Activity timeline 和当前 Permission。
每个 Tool Activity MUST 至少包含 toolCallId、toolName、状态和开始时间，并 MAY 包含
args summary 与 lossless result detail 或 result reference。

#### Scenario: Tool start 更新 Activity
- **WHEN** SubAgent 发布带 toolCallId 的 Tool start progress
- **THEN** 原 Agent Activity 增加一条 running Tool Activity
- **AND** 保存 args summary
- **AND** 不创建第二个 Agent Card

#### Scenario: Tool end 更新 Activity
- **WHEN** 同一 toolCallId 发布 Tool end progress
- **THEN** 原 Tool Activity 原位更新为 completed 或 failed
- **AND** 保存 endedAt、error 状态和可用 result detail

#### Scenario: 并行同名 Tool
- **WHEN** SubAgent 并行运行两个同名 read_file Tool
- **THEN** timeline 按 toolCallId 保留两个独立 Tool Activity
- **AND** 每个 result detail 只归属自己的 Tool

#### Scenario: Permission 绑定 Activity
- **WHEN** SubAgent Tool 进入 Permission prompt
- **THEN** Agent Activity 携带当前 Permission summary
- **AND** Permission 通过 toolCallId 绑定对应 Tool result owner
- **AND** Permission resolution 后该 summary 被清除

#### Scenario: 旧 Agent Tool Activity
- **WHEN** 历史 Agent Activity 的 Tool 只有 name、status 和 summary
- **THEN** Web 与 TUI 继续显示已有 timeline
- **AND** Inspector 将完整 result 标记为 unavailable 而不是伪造详情

### Requirement: Agent Activity 历史保留执行归属与详情引用

系统 SHALL 将 Agent Activity 的 attachment 与可用 Tool timeline 持久化到 Session。
历史恢复 SHALL 保留 foreground/background 归属，并 SHALL 能从持久化的 Agent Process
snapshot 解析 lossless Tool result reference，而不重新执行 Agent。

#### Scenario: 恢复 background Agent
- **WHEN** Session 包含已完成的 background Agent Activity
- **THEN** Web 与 TUI 恢复的 Card 仍标识为 background
- **AND** 不把历史 Activity 默认改为 foreground

#### Scenario: 恢复 Agent Tool 大结果
- **WHEN** 历史 Agent Tool 使用 Agent Process result reference
- **THEN** TUI 预加载对应 Process snapshot 并允许 Inspector 分页查看完整结果
- **AND** Process 缺失或损坏时显示 unavailable 而不是重新执行 Agent

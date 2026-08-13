## ADDED Requirements

### Requirement: TUI 使用 Turn、Execution 和 Tool 层级

TUI SHALL 将用户轮次展示为 Turn，并 SHALL 将 Main Agent 与每个 SubAgent 展示为
独立 Execution。每个 Tool Activity MUST 只属于一个 Execution。

#### Scenario: Main 委派 SubAgent
- **WHEN** Main Agent 通过 `spawn_agent` 启动 foreground SubAgent
- **THEN** TUI 在当前 Turn 的 Delegation 区域创建 SubAgent Execution Card
- **AND** `spawn_agent` 不重复显示为普通 Main Tool 行

#### Scenario: SubAgent 执行 Tool
- **WHEN** SubAgent 的 Runtime 启动 `bash`
- **THEN** `bash` 显示在该 SubAgent Card 的 Tool timeline 内
- **AND** 不显示在 Main Tool 列表或 Card 外的全局 Tool 区

#### Scenario: spawn 创建前失败
- **WHEN** `spawn_agent` 在 Agent Process 创建前因参数或 Application 错误失败
- **THEN** TUI 显示 failed `spawn_agent` Main Tool
- **AND** 不创建伪造的 SubAgent Card

### Requirement: Thinking 与 Tools 独立折叠

TUI SHALL 为 Main Thinking 和每个 Execution 的 Tools 提供独立折叠状态。折叠状态
MUST 为纯 UI state，不得写入模型 transcript。

#### Scenario: 运行中默认值
- **WHEN** Execution 进入 running
- **THEN** Thinking 默认折叠为一行摘要
- **AND** Tools 默认展开并显示当前 Tool

#### Scenario: 完成后默认值
- **WHEN** Execution 首次进入 completed
- **THEN** Tools 默认折叠为数量和结果统计摘要
- **AND** 用户仍可重新展开 Tool timeline

#### Scenario: 用户手动选择
- **WHEN** 用户手动展开或收起 Thinking 或 Tools
- **THEN** 后续相同状态的 progress snapshot 不重置该选择

### Requirement: Permission 在所属 Tool 内原位展示

SubAgent Permission prompt SHALL 显示在所属 Execution 的相关 Tool 下。Permission
处于待处理状态时，Tools MUST 展开且 MUST NOT 被用户收起。

#### Scenario: SubAgent 等待 bash 授权
- **WHEN** SubAgent 的 `bash` 触发 Permission prompt
- **THEN** Card 中 `bash` 状态更新为 permission
- **AND** Permission options 显示在 `bash` 下方

#### Scenario: Permission 已解决
- **WHEN** 用户允许或拒绝 Permission
- **THEN** Permission options 从 Card 消失
- **AND** 结果归并为对应 Tool 的后续状态
- **AND** TUI 不追加永久 `Permission: allowed` 或 `Permission: denied` 消息

### Requirement: 执行状态采用最具体活动

TUI SHALL 在存在具体 Execution/Tool activity 时显示该活动，并 MUST NOT 同时显示
语义重复的全局 Waiting。

#### Scenario: Tool 正在运行
- **WHEN** Researcher Agent 的 bash 已运行 8 秒
- **THEN** status line 显示 Researcher、bash 和 elapsed time
- **AND** 不显示独立的 `Waiting...` overlay

#### Scenario: 模型尚未产生具体活动
- **WHEN** Main turn 正在处理且不存在 Thinking、Tool、SubAgent 或 Permission activity
- **THEN** TUI MAY 显示全局 Waiting fallback

### Requirement: 渐进展示不丢失权威数据

TUI SHALL 使用摘要、折叠和受限详情控制视觉密度，但 MUST NOT 因默认展示限制而从
Session、Runtime transcript、Agent Activity projection 或 Process Store 删除完整内容。

#### Scenario: Tool history 已折叠
- **WHEN** completed Execution 的 Tools 折叠
- **THEN** TUI 显示 Tool 总数与成功/失败统计
- **AND** 展开后仍可访问已投影的 Tool timeline

#### Scenario: SubAgent 长结果
- **WHEN** SubAgent output 超过 Card 的可见详情预算
- **THEN** Card 显示受限详情与完整内容位置提示
- **AND** Agent Process Store 中的完整 output 保持不变

#### Scenario: 历史记录没有 Tool timeline
- **WHEN** 加载旧 Session 的 Agent Activity 且记录不含 Tool Activity
- **THEN** TUI 恢复 Agent task、状态与 result
- **AND** 不伪造 Tool timeline

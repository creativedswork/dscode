## MODIFIED Requirements

### Requirement: Thinking 与 Tools 独立折叠

TUI SHALL 为 Main Thinking 和每个 Execution 的 Tools 提供独立折叠状态。折叠状态
MUST 为纯 UI state，不得写入模型 transcript。折叠操作 MUST 通过具有可见 stable
selection 的 Activity Inspector 完成，MUST NOT 依赖 `Ctrl+R`、`Ctrl+O` 或
`Ctrl+N` 隐式猜测目标。

#### Scenario: 运行中默认值
- **WHEN** Execution 进入 running
- **THEN** Thinking 默认折叠为一行摘要
- **AND** Tools 默认展开并显示当前 Tool

#### Scenario: 完成后默认值
- **WHEN** Execution 首次进入 completed
- **THEN** Tools 默认折叠为数量和结果统计摘要
- **AND** 用户仍可在 Inspector 中重新展开 Tool timeline

#### Scenario: 用户手动选择
- **WHEN** 用户在 Inspector 中手动展开或收起 Thinking 或 Tools
- **THEN** 后续相同状态的 progress snapshot 不重置该选择
- **AND** Inspector selection 保持在同一 stable activity identity

#### Scenario: Chat 模式不隐式操作 disclosure
- **WHEN** Editor 聚焦且 Conversation Activity 在后台持续更新
- **THEN** 普通输入与旧 disclosure 快捷键不得改变任意 Thinking 或 Tools 折叠状态

### Requirement: Permission 在所属 Tool 内原位展示

SubAgent Permission prompt SHALL 显示在所属 Execution 的相关 Tool 下。Permission
处于待处理状态时，Tools MUST 展开且 MUST NOT 被用户收起。TUI MUST 将键盘焦点锁定
到 owner-bound Permission panel，并提供不依赖方向键的直接决策键。

#### Scenario: SubAgent 等待 bash 授权
- **WHEN** SubAgent 的 `bash` 触发 Permission prompt
- **THEN** Card 中 `bash` 状态更新为 permission
- **AND** Permission options 显示在 `bash` 下方
- **AND** panel 明确显示 SubAgent 和 Tool owner path

#### Scenario: Permission 数字键决策
- **WHEN** owner-bound Permission panel 已激活
- **THEN** 用户可使用数字键选择 allow-once、session grant、saved rule 或 guidance
- **AND** 用户可使用 `D` 直接拒绝
- **AND** `Enter` 确认当前 option

#### Scenario: Permission 已解决
- **WHEN** 用户允许或拒绝 Permission
- **THEN** Permission options 从 Card 消失
- **AND** 结果归并为对应 Tool 的后续状态
- **AND** TUI 不追加永久 `Permission: allowed` 或 `Permission: denied` 消息
- **AND** 输入焦点恢复到 Permission 出现前的 Inspector 或 Editor

### Requirement: 渐进展示不丢失权威数据

TUI SHALL 使用摘要、折叠和受限 viewport 控制视觉密度，但 MUST NOT 因默认展示限制
而从 canonical UI projection、Session、Runtime transcript、Agent Activity projection
或 Process Store 删除完整内容。摘要 formatter MUST NOT 覆盖 lossless Tool result。

#### Scenario: 长用户输入保持 Chat 紧凑
- **WHEN** 用户提交超过 1000 字符或 10 行的文本
- **THEN** Chat 仅显示首行摘要、字符数和行数
- **AND** canonical UIMessage、模型输入与 Session 中保留完整文本
- **AND** live 提交与 Session replay 使用相同摘要规则

#### Scenario: Tool history 已折叠
- **WHEN** completed Execution 的 Tools 折叠
- **THEN** TUI 显示 Tool 总数与成功/失败统计
- **AND** Inspector 展开后仍可访问已投影的 Tool timeline

#### Scenario: Main Tool 长结果
- **WHEN** Main read_file result 超过默认可见行预算
- **THEN** Chat 只显示不含换行的行数/字符数摘要
- **AND** Inspector output viewport 可分页访问完整 result
- **AND** 可见行预算不改变 canonical Tool result

#### Scenario: SubAgent 长结果
- **WHEN** SubAgent output 超过 Card 的可见详情预算
- **THEN** Card 显示受限详情与 Inspector 入口
- **AND** Agent Process Store 中的完整 output 保持不变

#### Scenario: SubAgent Tool 长结果
- **WHEN** SubAgent Tool result 超过 Inspector 的单页预算
- **THEN** Inspector 只渲染当前行窗口
- **AND** 通过 toolCallId 从 inline detail 或 Agent Process result reference 继续分页

#### Scenario: 历史记录没有 Tool timeline
- **WHEN** 加载旧 Session 的 Agent Activity 且记录不含 Tool Activity
- **THEN** TUI 恢复 Agent task、状态与 result
- **AND** 不伪造 Tool timeline

#### Scenario: 历史 Tool 只有摘要
- **WHEN** legacy Tool Activity 没有 lossless result 或 result reference
- **THEN** Inspector 显示现有摘要与 unavailable 状态
- **AND** 不把摘要声明为完整 output

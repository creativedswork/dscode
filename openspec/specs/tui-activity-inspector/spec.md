# tui-activity-inspector Specification

## Purpose
TBD - created by archiving change redesign-tui-conversation-interaction. Update Purpose after archive.
## Requirements
### Requirement: TUI 提供单一 Activity Inspector 入口

TUI SHALL 使用 `Ctrl+E` 在 Chat 与 Activity Inspector 之间切换。Chat 模式下 Editor
MUST 保持输入焦点；Inspector 打开时 MUST 保存 Editor 内容并把输入焦点交给 Inspector。

#### Scenario: 运行中打开 Inspector
- **WHEN** Main Turn 正在 streaming 且用户按下 `Ctrl+E`
- **THEN** TUI 打开 Activity Inspector
- **AND** Editor 中尚未提交的文本保持不变
- **AND** 后续按键由 Inspector 处理

#### Scenario: 关闭 Inspector
- **WHEN** Inspector Activity 列表已打开且用户按下 `Ctrl+E` 或 `Esc`
- **THEN** Inspector 关闭
- **AND** TUI 明确恢复 Editor focus

#### Scenario: 从任意 Inspector 层级关闭
- **WHEN** Inspector output viewport 已打开且用户按下 `Ctrl+E`
- **THEN** Inspector 关闭
- **AND** TUI 明确恢复 Editor focus

#### Scenario: Kitty Ctrl+E key release
- **WHEN** Kitty keyboard protocol 为一次 `Ctrl+E` 发送 press 和 release 事件
- **THEN** TUI 只使用 press 事件切换 Inspector
- **AND** release 事件不得立即撤销刚完成的 open 或 close

#### Scenario: 旧 disclosure 快捷键
- **WHEN** Chat 模式下用户按下 `Ctrl+R`、`Ctrl+O` 或 `Ctrl+N`
- **THEN** Conversation disclosure MUST NOT 通过这些全局快捷键改变
- **AND** TUI MUST NOT 隐式选择 Thinking、Tool 或 SubAgent

### Requirement: Inspector 自动定位最具体活动

Inspector SHALL 在首次打开时按稳定 activity identity 选择最具体的当前活动。选择优先级
MUST 为 Permission Tool、running Tool/Agent、streaming Thinking、最近 Activity。

#### Scenario: SubAgent 正在等待 Permission
- **WHEN** Researcher 的 bash Tool 正在等待 Permission 且用户打开 Inspector
- **THEN** Inspector 自动选中 `agent-tool:<agentId>:<toolCallId>`
- **AND** 不要求用户先遍历其他 Thinking 或 Tool

#### Scenario: Main Tool 正在运行
- **WHEN** 当前没有 Permission 且 Main 的 read_file 正在运行
- **THEN** Inspector 自动选中该 Main Tool

#### Scenario: 没有活动项
- **WHEN** 当前 Conversation 不含任何 inspectable Activity
- **THEN** Inspector 显示空状态
- **AND** 用户仍可使用 `Ctrl+E` 或 `Esc` 返回 Editor

### Requirement: Inspector selection 在运行更新中保持稳定

Inspector SHALL 使用 messageId、agentId 和 toolCallId 构造稳定 selection identity。
新增 progress snapshot 或 Activity MUST NOT 抢占仍然存在的用户 selection。

#### Scenario: 用户查看 Thinking 时新 Tool 启动
- **WHEN** 用户已选中当前 Thinking 且 Main 启动新的 Tool
- **THEN** Inspector selection 仍停留在该 Thinking
- **AND** 新 Tool 出现在可导航列表中但不自动获取焦点

#### Scenario: Selected Tool 状态更新
- **WHEN** selected Tool 从 running 更新为 completed
- **THEN** selection ID 保持不变
- **AND** Inspector 原位更新 status 和 result 可用状态

#### Scenario: Selected Activity 消失
- **WHEN** selected Activity 因 Session 切换或清理不再存在
- **THEN** Inspector 按当前最具体活动优先级重新选择
- **AND** 不保留指向不存在 Activity 的焦点

### Requirement: Inspector 使用可预测的局部键盘协议

Inspector SHALL 使用 `Tab` / `Shift+Tab` 作为主要 selection 导航，并 SHALL 使用
`Enter` 作为统一 activate 操作。方向键和 `J` / `K` MAY 作为等价辅助导航。

#### Scenario: 切换 inspectable item
- **WHEN** Inspector 已打开且用户按下 `Tab`
- **THEN** selection 移动到下一个 inspectable item
- **AND** 到达末尾后循环至第一项

#### Scenario: 反向切换
- **WHEN** Inspector 已打开且用户按下 `Shift+Tab`
- **THEN** selection 移动到上一个 inspectable item

#### Scenario: 展开 Thinking
- **WHEN** selection 位于折叠 Thinking 且用户按下 `Enter` 或 `→`
- **THEN** Thinking 在 Inspector 中展开
- **AND** streaming delta 不重置展开状态

#### Scenario: 收起当前项
- **WHEN** selection 位于已展开 Thinking 或 Execution 且用户按下 `←`
- **THEN** 当前项收起
- **AND** selection 保持在同一 activity identity

### Requirement: Inspector 提供完整 Tool output viewport

当 Tool 具有 result 时，Inspector SHALL 允许用户从选中 Tool 打开固定高度 output
viewport。Viewport MUST 支持逐行和分页浏览完整 result；可见行预算 MUST NOT 改写或
截断 canonical result。

#### Scenario: 打开长 Tool result
- **WHEN** selected read_file result 包含 173 行且用户按下 `Enter`
- **THEN** Inspector 打开 output viewport
- **AND** header 显示当前行范围与总行数
- **AND** 第一页之外的行仍可通过分页访问

#### Scenario: 分页 Tool result
- **WHEN** output viewport 已打开且用户按下 `PgDn`
- **THEN** viewport 向后移动一个可见行窗口
- **AND** selection owner 和 Tool identity 保持不变

#### Scenario: 逐行浏览 Tool result
- **WHEN** output viewport 已打开且用户按下 `↓` 或 `J`
- **THEN** viewport 向后移动一行且不超过完整 result 的末尾
- **AND** `↑` 或 `K` 提供对称的向前逐行浏览

#### Scenario: 返回 Activity 列表
- **WHEN** output viewport 已打开且用户按下 `←` 或 `Esc`
- **THEN** Inspector 返回 Activity 列表
- **AND** 原 Tool 仍为 selected item

#### Scenario: 历史记录没有完整 result
- **WHEN** legacy Agent Tool Activity 只包含状态和摘要
- **THEN** Inspector 显示可用摘要与 unavailable 提示
- **AND** MUST NOT 伪造完整 output

### Requirement: Permission 获得 owner-bound 输入优先级

Pending Permission SHALL 绑定到所属 Execution 和 Tool，并 SHALL 在待处理期间获得高于
Editor 与普通 Inspector 的输入优先级。Permission MUST 支持数字键直接选择、
`Enter` 确认和 `D` 拒绝。

#### Scenario: SubAgent Permission 出现
- **WHEN** Researcher 的 bash 触发 Permission
- **THEN** Permission panel 显示 owner path `Researcher › bash`
- **AND** 输入焦点锁定到 Permission panel
- **AND** 默认选中 Allow once

#### Scenario: 数字键允许一次
- **WHEN** Permission panel 激活且用户按下 `1`
- **THEN** 当前 Tool Call 以 allow-once 决策继续
- **AND** 用户无需使用方向键

#### Scenario: 数字键选择持久规则
- **WHEN** Permission panel 激活且用户按下 `3`
- **THEN** TUI 进入保存匹配规则的 scope 选择或直接确认流程
- **AND** scope 选择可继续仅使用数字键完成

#### Scenario: 直接拒绝
- **WHEN** Permission panel 激活且用户按下 `D`
- **THEN** 当前 Permission 以 deny 决策解决
- **AND** Permission panel 消失

#### Scenario: Permission 解决后恢复焦点
- **WHEN** Permission 在 Inspector 打开期间解决
- **THEN** TUI 恢复 Inspector 及其先前 selection
- **AND** 若 Permission 出现前为 Chat 模式则恢复 Editor focus


# tui-execution-hierarchy Specification (Delta)

## MODIFIED Requirements

### Requirement: Permission 在所属 Tool 内原位展示

SubAgent Permission prompt SHALL 显示在独立统一权限面板（对话底部），并标注
`Owner: <label> › <toolName>` 来源。Permission 处于待处理状态时，所属 Execution 的
Tools MUST NOT 被强制展开，且 MUST NOT 被禁止收起。TUI MUST 将键盘焦点锁定到
owner-bound Permission panel，并提供不依赖方向键的直接决策键。

#### Scenario: SubAgent 等待 bash 授权
- **WHEN** SubAgent 的 `bash` 触发 Permission prompt
- **THEN** Card 中 `bash` 状态更新为 permission
- **AND** Permission options 显示在对话底部独立权限面板，而非 `bash` 下方
- **AND** panel 明确显示 SubAgent 和 Tool owner path

#### Scenario: Permission 数字键决策
- **WHEN** owner-bound Permission panel 已激活
- **THEN** 用户可使用数字键选择 allow-once、session grant、saved rule 或 guidance
- **AND** 用户可使用 `D` 直接拒绝
- **AND** `Enter` 确认当前 option

#### Scenario: Permission 已解决
- **WHEN** 用户允许或拒绝 Permission
- **THEN** Permission options 从统一权限面板消失
- **AND** 结果归并为对应 Tool 的后续状态
- **AND** TUI 不追加永久 `Permission: allowed` 或 `Permission: denied` 消息
- **AND** 输入焦点恢复到 Permission 出现前的 Inspector 或 Editor

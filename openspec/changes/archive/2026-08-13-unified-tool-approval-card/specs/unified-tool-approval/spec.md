# unified-tool-approval Specification

## Purpose

定义 Web 与 TUI 两端的统一 SubAgent 工具审批面：独立渲染位置、来源 Agent 归属标注、
审批决策交互，以及与 Agent/Execution Card 的解耦契约。

## ADDED Requirements

### Requirement: 统一审批面承载 SubAgent 工具审批

Web 与 TUI SHALL 将可归属到 SubAgent 的 Permission 渲染在一个独立、稳定的统一审批面
（Web 为吸底卡片，TUI 为底部面板）中，而不是内嵌在对应的 Agent/Execution Card 内。

#### Scenario: 归属明确的 SubAgent Permission
- **WHEN** SubAgent 的工具触发 `permission_prompt` 且 `agentId` 或 `toolCallId` 可解析到某个 Agent Activity
- **THEN** 统一审批面显示该审批
- **AND** 该审批不在对应 Agent/Execution Card 内原位渲染

#### Scenario: 无归属的 Permission 回退
- **WHEN** Permission 无法归属到任何 SubAgent Activity（如主 Agent 权限请求）
- **THEN** 回退到既有独立交互控件，不丢弃审批请求

### Requirement: 审批面标注来源 Agent

统一审批面 SHALL 显示审批来源 Agent 的用户可见角色 label 与 tool 归属。Web 显示
角色 label、格式化 agent id 与 application；TUI 显示 `Owner: <label> › <toolName>`。

#### Scenario: 显示来源归属
- **WHEN** 统一审批面渲染一条 SubAgent 审批
- **THEN** 审批面显示来源角色 label 与 tool 归属
- **AND** 用户无需展开对应 Agent/Execution Card 即可识别请求方

#### Scenario: 无法解析来源
- **WHEN** 审批归属的 Agent Activity 尚未投影或缺失
- **THEN** 审批面回退显示原始 `agentId` 与 toolName，并 MUST NOT 丢弃审批请求

### Requirement: 审批面位置稳定可见

统一审批面 SHALL 采用稳定位置（Web 吸底停靠，TUI 对话底部块），不因并行 SubAgent
卡片增多而被挤出视野。

#### Scenario: 并行 SubAgent 时保持可见
- **WHEN** 对话中存在多个并行 SubAgent 且其中某个 SubAgent 触发审批
- **THEN** 统一审批面位于稳定位置（Web 吸底 / TUI 底部）
- **AND** 用户无需滚动定位到特定的 SubAgent 卡片

### Requirement: 审批决策动作保持一致

统一审批面 SHALL 提供与既有审批交互一致的决策动作（Allow / Always Allow / Save to
Settings / guidance / Deny 及 fuzzy 选项），并复用同一决策回调路径（Web `onPermission`，
TUI `resolvePermissionChoice`）。

#### Scenario: Allow 决策
- **WHEN** 用户在统一审批面执行 allow 决策
- **THEN** 前端按既有路径发送 permission 命令/结果，decision 为 allow 并携带工具身份

#### Scenario: Deny 决策
- **WHEN** 用户在统一审批面执行 deny 决策
- **THEN** 前端按既有路径发送 permission 命令/结果，decision 为 deny 并携带工具身份

### Requirement: 复用现有设计系统

统一审批面 SHALL 复用各自现有设计系统（Web 的 `--color-*` token 与 Geist 字体，TUI 的
`c.*` theme 与等宽字体），MUST NOT 引入第三方组件库。

#### Scenario: 使用既有 token
- **WHEN** 统一审批面渲染
- **THEN** Web 面颜色/边框/圆角/间距来自 `--color-*` token，TUI 面来自 `c.*` theme

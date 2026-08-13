# Proposal: unified-tool-approval-card

## Why

Web 与 TUI 两端的 SubAgent 工具审批目前都**原位渲染在对应 Agent/Execution Card 内部**：为了露出审批按钮，卡片会强制展开 Tool timeline 并锁定折叠开关；当多个 SubAgent 并行时，携带审批的卡片会被顶到可视区域外，用户每次审批都要滚动定位。这既破坏对话的可视预览体验，也让并行审批难以发现。需要把审批收敛到一个独立、稳定、带来源归属的审批面中，两端同步。

## What Changes

- 新增一个**独立的统一工具审批面**：Web 端为吸底停靠的审批卡片，TUI 端为对话底部独立权限面板；两者都不内嵌在 Agent/Execution Card 内，渲染位置独立、稳定。
- 审批面必须**标注审批来源 Agent**：显示用户可见角色 label、格式化 agent id（Web）或 `Owner: <label> › <toolName>`（TUI），让用户在无需展开对应卡片的情况下知道「这是哪个 Agent 在请求授权」。
- `AgentActivityCard`（Web）与 `TuiAgentActivityCard`（TUI）不再内嵌审批控件，也不再因为存在待审批请求而**强制展开工具列表或锁定折叠开关**。
- Web 移除 `AgentActivityCard` 的 `permissionControl` / `permissionToolCallId` 内嵌渲染与强制展开逻辑；TUI 移除 `makeAgentCard` 的 `permissionLines` 注入与 `activity.permission` 触发的强制展开。
- 无法归属到任何 SubAgent（即主 Agent 的权限请求）仍走既有独立交互控件，行为不变。

## Capabilities

### New Capabilities

- `unified-tool-approval`: 统一的 SubAgent 工具审批面（Web 卡片 + TUI 面板）—— 独立渲染位置、来源 Agent 归属标注、审批决策交互，以及与 Agent/Execution Card 的解耦契约。

### Modified Capabilities

- `agent-activity-display`: 修改「Web Permission 归属 Agent Activity」与「TUI 紧凑展示」需求 —— Web/TUI 不再将可归属的 SubAgent Permission 原位显示在 Activity Card 内，而是交给统一审批面展示（保留来源归属），并明确 Activity Card 不因待审批请求而强制展开或锁定工具列表。
- `tui-execution-hierarchy`: 修改「Permission 在所属 Tool 内原位展示」需求 —— TUI Permission prompt 显示在独立统一权限面板，而非所属 Execution 的 Tool 下；待审批期间 Tools 不再强制展开或禁止收起。

## Impact

- **受影响代码（Web）**：`web/src/components/ChatView.tsx`、`web/src/components/AgentActivityCard.tsx`、`web/src/index.css`。
- **受影响代码（TUI）**：`src/ui/tui/conversation.ts`（`formatAgentActivityForTui`、`defaultAgentToolsExpanded`、`makeAgentCard`、`renderLive`、`renderPermPrompt`）。
- **受影响 spec**：`agent-activity-display`、`tui-execution-hierarchy`（增量变更），新增 `unified-tool-approval`。
- **不受影响**：后端权限队列（`PermissionPromptQueue` 仍串行化）、`permission_prompt` 事件协议与 `PermissionPrompt` 数据模型（已含 `agentId`/`toolCallId`/`toolName`/`preview`，来源归属所需字段已存在，无需后端改动）。
- **无破坏性变更**：主 Agent 权限气泡/面板、`pendingPermission` 会话恢复路径、TUI 数字键直接决策与焦点恢复保持不变。

# Design: unified-tool-approval-card

## Context

Web 与 TUI 两端的 SubAgent 工具审批都通过 `PermissionPrompt`（含 `agentId`/`toolCallId`/`toolName`/`preview`）驱动，后端 `PermissionPromptQueue` 已串行化审批（一次仅一个待审批请求）。

- **Web**：`ChatView` 用 `findPermissionOwnerAgentId` 找到归属的 `AgentActivity`，把 `InlinePermission` 作为 `permissionControl` 传入 `AgentActivityCard` 原位渲染；卡片在存在 `permissionControl` 时强制 `setToolsExpanded(true)` 并禁用「Hide tools」。
- **TUI**：`ConversationView.showPermissionPrompt` 设置 `_activePermission`，`makeAgentCard` 把 `renderPermPrompt()` 作为 `permissionLines` 注入归属的 Execution Card；`formatAgentActivityForTui` 在 `activity.permission` 存在时强制 `expanded = true` 并内联渲染审批选项。

两个痛点（两端对称）：审批被钉在单个卡片内，并行时被挤出视野；且强制展开/锁定工具列表破坏默认折叠预览。方案是把审批收敛到独立、稳定、带来源归属的审批面，两端同步。

## Goals / Non-Goals

**Goals:**
- 将 SubAgent 工具审批从 Agent/Execution Card 内迁移到独立、位置稳定的统一审批面（Web 吸底卡片 / TUI 底部面板）。
- 审批面标注来源 Agent（Web：label + agentId + application；TUI：`Owner: <label> › <toolName>`），无需展开对应卡片即可识别请求方。
- 解除 Agent/Execution Card 因审批而「强制展开 / 锁定工具列表」的行为。
- 保持主 Agent（无归属）权限交互、`pendingPermission` 恢复、TUI 数字键决策与焦点恢复不变。

**Non-Goals:**
- 不改造后端权限队列或 `permission_prompt` 协议（仍一次一个待审批）。
- 不引入第三方组件库；Web 沿用 `--color-*` token，TUI 沿用 `c.*` theme。
- 不实现「多审批并发排队」的 UI（当前后端串行，留作 Open Question）。

## Decisions

### D1 — Web 统一审批卡片采用「吸底停靠」位置

卡片作为对话滚动容器内的 `position: sticky; bottom: 0` 元素渲染，始终停靠在滚动区底部、输入框上方。待审批请求不被并行卡片挤出视野，且不遮挡消息流（滚动容器为卡片保留其自身高度）。

- **替代方案 A**：作为普通消息追加在对话流末尾。被否：上滚回看时仍可能离开视野。
- **替代方案 B**：复用遗留的全屏 `PermissionDialog` 模态。被否：遮挡对话、打断上下文，且该模态已无人使用。

### D2 — Web 审批卡片标注来源 Agent

卡片头部新增来源归属：用户可见角色 label（如 `Researcher`）、格式化 agent id（`formatAgentDisplayId`）与 application。归属由 `findPermissionOwnerAgentId` 从 `messages` 解析出 `AgentActivity` 后取其 `label`/`application`；无匹配 Activity 时回退显示原始 `agentId` 与 toolName，**绝不丢弃审批请求**。

### D3 — `AgentActivityCard` 与审批解耦

删除 `AgentActivityCard` 的 `permissionControl`/`permissionToolCallId` props 与内嵌渲染分支，删除强制 `toolsExpanded` / 禁用 toggle 的 `useEffect`。卡片仍通过 `state-waiting` 体现「等待授权」，但不在卡片内渲染审批控件。

### D4 — 复用 `InlinePermission` 作为 Web 审批决策体

保留现有 `InlinePermission`（toolName/preview/fuzzy/explain 决策按钮）作为「决策体」，新建「统一审批卡片」外壳包裹它，外壳负责来源归属头部 + 吸底停靠样式。决策逻辑零改动。

### D5 — TUI 审批面板独立于 Execution Card

`renderPermPrompt()` 改为独立块渲染在对话底部（始终位于最后），不再通过 `makeAgentCard` 的 `permissionLines` 注入卡片。`renderLive` 移除 `permissionHasAgentCard` 条件，使 `_activePermission` 存在时统一面板始终渲染。面板保留 `Owner: <label> › <toolName>` 归属行与 5 个决策项。

- **替代方案**：把面板固定为覆盖层（overlay）。被否：会遮挡对话；底部块更符合终端滚动流，且能保持归属上下文与选项完整可见。

### D6 — TUI 解除 `activity.permission` 强制展开

删除 `formatAgentActivityForTui` 中 `activity.permission ? true : ...` 的强制展开与内联 `Permission required` 渲染分支；`defaultAgentToolsExpanded` 不再因 `activity.permission` 返回 true。Execution Card 的 Tool timeline 折叠状态由用户/Inspector 决定，不受待审批请求干扰。

### D7 — 零后端改动

`PermissionPrompt` 已含 `agentId`/`toolCallId`，归属解析在两端前端完成；`onPermission` / `permission_response` 命令路径与 TUI `resolvePermissionChoice` 路径保持不变。

## Risks / Trade-offs

- [Web 吸底卡片可能遮挡末尾消息或与自动滚动冲突] → 卡片以 `sticky` 占据自身布局高度（不绝对覆盖），并随 `permissionPrompt` 变化参与现有 `useLayoutEffect` 滚动锚定。
- [TUI 底部面板在用户上滚回看时可能离开视野] → 审批期间面板是唯一待决策焦点，`TuiPermissionInput` 捕获键盘输入并维持底部渲染；归属信息在面板内自足，无需回到具体卡片。
- [归属解析失败（Activity 尚未投影）时审批面缺少来源] → 回退显示原始 `agentId`/toolName，不阻断审批。
- [未来若支持并发审批，单审批面需扩展为队列] → 当前后端串行，本次不实现；Web 卡片与 TUI 面板内部预留列表容器语义，便于后续扩展。
- [删除强制展开后，用户可能看不到是哪个 tool 在等待] → 由审批面直接展示 toolName/preview 与来源 Agent，信息自足。

## Migration Plan

- 纯前端改动，无数据迁移。Web 重新构建 `web/`，TUI 重新构建 `dist/dscode.mjs`。
- 回滚策略：保留 `InlinePermission` 原实现与 `AgentActivityCard` props 语义、TUI `renderPermPrompt` 原实现，回滚即恢复两端的内嵌注入分支。

## Open Questions

- 是否需要为未来「并发审批」预留队列 UI（当前后端串行，暂不需要）。
- TUI 底部面板在窄终端（80 列）下的选项换行密度是否需进一步压缩（初版沿用现有决策项排版）。

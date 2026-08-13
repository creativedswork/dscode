# Consolidate: unified-tool-approval-card

## 变更综述

SubAgent 从后台进程逐步投影为可恢复的对话 UI 后，两端（Web / TUI）经历了从「Agent
Activity Card 内联展示」到「独立、稳定、带来源归属的统一审批面」的演进。早期把
Permission 原位钉在对应 Agent/Execution Card 内，迫使卡片强制展开并锁定工具列表，
并行 SubAgent 时审批被挤出视野；本次 change 将 SubAgent 工具审批收敛到独立吸底卡片
（Web）与对话底部权限面板（TUI），两端同步解耦，并保留主 Agent 权限回退与既有决策路径。

## 变更时间线

- 2026-08-04: show-subagents-in-conversation — 引入通用 Agent Activity 数据结构与 Web/TUI 内联 Agent Activity Card
- 2026-08-07: tui-execution-hierarchy-redesign — 重构 TUI 为 Turn → Execution → Tool 层级，Permission 在所属 Tool 内原位展示
- 2026-08-08: redesign-tui-conversation-interaction — 新增 Activity Inspector，统一 owner-aware 浏览与焦点可见性
- 2026-08-13: unified-tool-approval-card — 统一 SubAgent 工具审批面（Web 吸底卡片 + TUI 底部面板），与 Card 解耦

## 初始设计

**问题**：SubAgent 已是独立 Agent Process，但对话 UI 只展示 Main Agent，用户无法理解
哪个 Agent 被启动、状态、耗时与结果。Session 已有 `agentMessages` 持久化，因此把进程
执行轨迹投影为可恢复的对话 UI。

**方案**：
- 在共享对话模型增加通用 Agent Activity 数据结构（Application、进程 ID、前后台挂载、
  状态、输入/输出摘要、错误与时间）。
- 将 `agent:spawned` / `agent:state` / `agent:progress` / `agent:output` / `agent:exit`
  投影为 Session scoped UI 事件，实时更新同一 Agent 卡片。
- Session 加载时从 `agentMessages` 重建历史，不恢复/重跑 Agent Process。
- Web 增加内联 Agent Activity Card；TUI 使用同一投影显示紧凑状态块与终态摘要。

## 变更记录

### 变更: TUI 执行层级重构
- **触发**: 扁平日志流导致执行归属不清、重复信息、卡片外 Tool、长内容挤满视口。
- **改动**: 重构为 `Turn → Execution → Tool` 执行树；Permission 在所属 Tool 内原位展示；
  Thinking/Tools 独立折叠；`spawn_agent` 不再重复显示。
- **影响**: `tui-execution-hierarchy` 能力；TUI 对话渲染与执行归属。

### 变更: TUI 交互与 Activity Inspector
- **触发**: 全局快捷键隐式猜测目标，焦点缺乏稳定 identity，Permission 在 Card 内难以可靠操作。
- **改动**: 新增 Activity Inspector（`Ctrl+E`），稳定 activity identity 保持焦点；移除
  `Ctrl+R/O/N` disclosure 快捷键；Tool result 改为摘要 + 完整详情 viewport。
- **影响**: `tui-activity-inspector`、`tui-execution-hierarchy`、`agent-activity-display`。

### 变更: 统一工具审批面
- **触发**: 两端 SubAgent 审批原位渲染在 Card 内，强制展开/锁定工具列表，并行时被挤出视野。
- **改动**: Web 新增吸底 `ToolApprovalCard`，TUI 新增对话底部权限面板；两端不再向
  Agent/Execution Card 注入审批控件，不再因待审批强制展开/锁定工具列表；保留来源归属与主 Agent 回退。
- **影响**: 新增 `unified-tool-approval`；修改 `agent-activity-display`、`tui-execution-hierarchy`。

## 修复记录

无独立 bug-fix change；本次演进均为设计/结构变更。

## 最终状态

**统一 SubAgent 工具审批面**（Web 吸底卡片 + TUI 底部面板）：
- 独立、稳定的渲染位置，不因并行 SubAgent 卡片增多而被挤出视野。
- 标注来源 Agent（Web：`label + agentId + application`；TUI：`Owner: <label> › <toolName>`）。
- 与 Agent/Execution Card 解耦：Card 不再内嵌审批控件，不再因待审批强制展开或锁定工具列表。
- 主 Agent（无归属）权限回退到既有独立交互控件；`pendingPermission` 恢复、TUI 数字键
  决策与焦点恢复、后端 `PermissionPromptQueue` 与 `permission_prompt` 协议均保持不变。

# Tasks: unified-tool-approval-card

## 1. Web 解耦 AgentActivityCard 与审批

- [x] 1.1 从 `web/src/components/AgentActivityCard.tsx` 移除 `permissionControl` / `permissionToolCallId` props 及其类型定义
- [x] 1.2 删除卡片内 Tool 行与 `agent-activity-execution-permission` 区块中内嵌 `permissionControl` 的渲染分支
- [x] 1.3 删除「存在 `permissionControl` 时 `setToolsExpanded(true)` 并禁用 tools toggle」的 `useEffect`，恢复工具列表默认折叠与 toggle 可用
- [x] 1.4 移除不再使用的 `permissionHasMatchingTool` / `effectivePermissionToolCallId` 等派生逻辑

## 2. Web 新增统一审批卡片组件

- [x] 2.1 新建 `web/src/components/ToolApprovalCard.tsx`，以 `position: sticky; bottom: 0` 外壳包裹现有 `InlinePermission` 决策体
- [x] 2.2 在卡片头部渲染来源归属：角色 label、`formatAgentDisplayId(agentId)`、application，并支持无归属回退（显示原始 agentId 与 toolName）
- [x] 2.3 扩展 `ChatView` 中的归属解析，从 `findPermissionOwnerAgentId` 返回完整 owning `AgentActivity`（或 attribution 对象），供卡片读取 label/application

## 3. Web 接入 ChatView

- [x] 3.1 在 `ChatView.tsx` 中将「有归属的 SubAgent Permission」改为渲染 `ToolApprovalCard`（吸底），不再向 `AgentActivityCard` 注入 `permissionControl`
- [x] 3.2 保持「无归属的主 Agent Permission」回退到既有独立 `InlinePermission` 气泡，行为不变

## 4. Web 样式

- [x] 4.1 在 `web/src/index.css` 新增统一审批卡片样式，复用 `--color-*` token 与 warm design system（warning 色系左边框、吸底阴影、来源归属行、决策按钮组）

## 5. TUI 权限面板独立化与解耦

- [x] 5.1 修改 `src/ui/tui/conversation.ts` 的 `formatAgentActivityForTui`：移除 `activity.permission` 触发的强制展开与内联 `Permission required`/preview/options 渲染分支
- [x] 5.2 修改 `defaultAgentToolsExpanded`：不再因 `activity.permission` 返回 true
- [x] 5.3 修改 `makeAgentCard`：移除 `permissionLines` 注入，不再把 `renderPermPrompt` 内嵌进 Execution Card
- [x] 5.4 修改 `renderLive`：移除 `permissionHasAgentCard` 条件，`_activePermission` 存在时始终在对话底部渲染统一权限面板
- [x] 5.5 保留 `renderPermPrompt` 的 `Owner: <label> › <toolName>` 归属行与 5 个决策项（数字键 / Enter / D）

## 6. 验证

- [x] 6.1 运行 `npm run typecheck` 与 `npm run build`，确认 Web 与 CLI/TUI 无类型/构建错误
- [x] 6.2 在浏览器对照 `docs/prototypes/archive/2026-08-13-unified-tool-approval-card/unified-tool-approval-card-conversation.html` 验证：New/Old 对比、来源 Agent 切换、亮/暗主题、SubAgent 卡片不再被强制展开或锁定
- [x] 6.3 在浏览器对照 `docs/prototypes/archive/2026-08-13-unified-tool-approval-card/unified-tool-approval-card-tui.html` 验证：New/Old 对比、80/120 列、亮/暗主题、独立面板的 owner path 与决策项
- [x] 6.4 确认主 Agent 权限气泡/面板、`pendingPermission` 恢复路径、TUI 数字键直接决策与焦点恢复不受影响

## Why

Plan A 在切换 session 时 abort + save + deny 了权限弹窗，但被中断的 session 中留下了一个"空气泡"——助手请求了 tool permission 但从未被响应。切回去时对话历史里有一句不完整的 tool 请求，用户不知道发生了什么，也无法继续。需要实现方案 B：权限弹窗绑定 session，切回来时自动恢复。

## What Changes

- **Session 元数据扩展**: `SessionMetadata` 新增 `pendingPermission` 字段，存储被中断的 tool permission 信息（toolName, preview, fuzzyPattern, permissionArgs）
- **切换时清理对话**: save session 前回滚最后一条 partial assistant message（tool 请求未被响应的那条），保存干净对话 + `pendingPermission` 元数据
- **加载时自动恢复**: `pushSessionList` / `sessions` event 携带 `pendingPermission`，前端检测到后自动弹出 PermissionDialog
- **用户响应后继续**: Allow → 后端重新触发 agent（从最后 user message 开始，agent 会重新请求 tool permission 并被自动允许）；Deny → 清除 pendingPermission，对话保持干净
- **前端**: SessionsPanel 读取 `pendingPermission` 字段，自动渲染 PermissionDialog

## Capabilities

### New Capabilities
- `session-permission-persistence`: Session 元数据 SHALL 支持存储和恢复被中断的 tool permission 状态，使权限弹窗可以跨 session 切换保留

### Modified Capabilities
- `session-management`: `saveSession` 和 `loadSession` SHALL 支持 `pendingPermission` 字段的读写，保存时自动回滚未完成的 partial assistant message
- `web-frontend`: `SessionsPanel` 和 `App` 组件 SHALL 在 session 加载时检测 `pendingPermission` 并自动弹出 PermissionDialog
- `websocket-protocol`: `sessions` event 和 `SessionInfo` 类型 SHALL 新增 `pendingPermission` 字段

## Impact

- **Server**: `src/session/manager.ts` — saveSession 回滚逻辑 + pendingPermission 读写；`src/session/types.ts` — SessionMetadata 扩展
- **Client**: `web/src/components/App.tsx` — pendingPermission 检测 + 自动弹窗；`web/src/components/Sidebar.tsx` — SessionInfo 类型
- **Protocol**: `src/ui/web/protocol.ts` — SessionInfo + sessions event
- **No API changes**, 无 breaking changes

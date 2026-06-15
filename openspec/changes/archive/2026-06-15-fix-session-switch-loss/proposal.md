## Why

在 Web UI 中，当 session A 正在流式输出时，用户点击历史 session B，当前 session A 会丢失——server 不 abort 也不 save 就直接覆盖 `agent.state.messages`，前端收到 `clear_conversation` 清空 UI。A 的输出继续流入但被追加到 B 的历史后面，造成消息混乱和数据丢失。此外，空 session（messageCount=0）会在每次 `/reset` 或 "New Session" 时产生，累积在会话列表和磁盘中，造成垃圾 session 堆积。用户预期：(1) 切换 session 时保留当前 session，(2) 切回来时输出连续可见，(3) 不会看到 0 消息的空会话条目。

## What Changes

- **Server**: `handleSession` `load` 在加载前 abort 当前 running turn、save 当前 session、发送 `pushSessionList` 更新 sidebar
- **Protocol**: `sessions` event 新增 `currentSessionId` 和 `isProcessing` 字段，前后端统一按 `currentSessionId` 判断活跃 session 身份
- **Frontend**: sidebar session 列表为 running session 渲染旋转指示器（spinner）；`clear_conversation` 和 `ready` 事件处理时保留 `processing` 状态的正确语义
- **Slash command**: `/session load` 对齐 sidebar 的行为，也先 abort+save
- **Session 生命周期**: 禁止 0 消息的空 session 存在——新建 session 时复用已有的空 session；session 列表过滤掉空 session；`persistEmptySession` 在保存前删除已有空 session

## Capabilities

### New Capabilities
- `session-running-indicator`: Session 列表项在对应 session 正在运行（agent processing）时显示旋转加载指示器，使用 Phosphor Icons 的 `Spinner` 图标配合 CSS 旋转动画

### Modified Capabilities
- `web-frontend`: Sessions 列表项增加 running 指示器；事件处理修正 `currentSessionId` 跟踪逻辑
- `session-management`: `loadSession` 需要在覆盖 agent 状态前 abort 当前 turn，并先 save 当前 session
- `websocket-protocol`: `sessions` event 新增 `isProcessing: boolean` 字段，`currentSessionId` 在事件中如实反映当前活跃 session
- `web-session-load-slash`: `/session load` slash command 对齐 sidebar 行为——先 abort+save 再 load
- `session-management`: `createSession` 复用已有空 session 的 ID；`persistEmptySession` 保证磁盘上最多一个空 session；`listSessions` 过滤 `messageCount === 0` 的条目

## Impact

- **Protocol**: `src/ui/shared/types.ts` SessionInfo + `sessions` ServerEvent
- **Server**: `src/ui/web/web-backend.ts` handleSession (load case), handleSlashCommand
- **Session Manager**: `src/session/manager.ts` `createSession` 空 session 复用逻辑、`persistEmptySession` 去重、`listSessions` 过滤
- **Frontend**: `web/src/components/App.tsx` handleEvent, `web/src/components/Sidebar.tsx` SessionsPanel
- **Slash commands**: `src/ui/commands.ts` `/reset` 命令创建新 session 的逻辑
- **No impact**: TUI backend, eval pipeline, MCP layer, permissions

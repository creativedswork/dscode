## Why

SubAgent 已成为独立 Agent Process，但当前对话 UI 仍只展示 Main Agent；用户只能在
后台 Agent 退出时看到短暂 toast，无法理解哪个 Agent 被启动、当前状态、耗时和结果。
Session 中已有 `agentMessages` 持久化记录，因此需要把进程执行轨迹投影为可恢复的
对话 UI，而不是继续隐藏在 Process Store 中。

## What Changes

- 在共享对话模型中增加通用 Agent Activity 数据结构，表达 Application、进程 ID、
  前后台挂载、状态、输入摘要、输出摘要、错误和时间信息。
- 将 `agent:spawned`、`agent:state`、`agent:progress`、`agent:output` 和
  `agent:exit` 投影为 Session scoped UI 事件，实时更新同一 Agent 卡片。
- Session 加载时从 `agentMessages` 重建历史 Agent Activity，不恢复或重新运行
  Agent Process，也不把 SubAgent transcript 注入 Main Agent 推理上下文。
- Web 对话流增加内联 Agent Activity Card：默认显示状态、Application、耗时和摘要，
  输出详情默认折叠并可展开。
- TUI 使用同一共享投影，显示紧凑的 Agent 状态块和可读的终态摘要。
- 保持旧 Session 和不含 Agent Activity 的消息协议兼容。

## Capabilities

### New Capabilities

- `agent-activity-display`: 定义 SubAgent 执行记录在 Web/TUI 对话流中的实时展示、
  历史恢复、折叠详情和 Session 路由行为。

### Modified Capabilities

- `shared-conversation-model`: 扩展 canonical conversation model 和 reducer，使其支持
  Agent Activity 消息及生命周期增量更新。
- `agent-progress-notification`: 将 Agent 生命周期事件补全为可供 UI 投影的
  Session scoped 结构，并保证同一 agentId 更新同一活动记录。
- `web-frontend`: 在 editorial workshop 对话布局中增加内联 Agent Activity Card。

## Impact

- `src/ui/shared/types.ts`、`src/ui/shared/reducer.ts`：共享 Agent Activity 类型和
  reducer 行为。
- `src/session/display.ts`：从 `agentMessages` 重建历史 Agent Activity，同时保持
  Main messages 与 SubAgent 记录隔离。
- `src/core/events.ts`、`src/ui/web/protocol.ts`、`src/ui/web/web-backend.ts`：
  Session scoped Agent UI 事件转发。
- `web/src/components/ChatView.tsx`、`web/src/index.css`：内联可折叠 Agent 卡片。
- `src/ui/conversation.ts`、`src/ui/tui-backend.ts`：TUI 紧凑状态块和历史 replay。
- Session v3 与 Agent Process Store 物理格式不变，不新增运行时依赖。

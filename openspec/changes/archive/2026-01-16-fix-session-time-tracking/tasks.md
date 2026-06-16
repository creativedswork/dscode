## 1. SessionManager 计时控制

- [x] 1.1 新增 `startActiveTimer()` 方法：当 `activeSince === null` 时设为 `Date.now()`
- [x] 1.2 新增 `stopActiveTimer()` 方法：累积 `Date.now() - activeSince`，设 `activeSince = null`，同步更新 `current.totalActiveMs`
- [x] 1.3 `createSession()` 中移除 `this.activeSince = Date.now()`（两处：复用已有 session 分支 + 新建分支）
- [x] 1.4 `loadSession()` 中移除 `this.activeSince = Date.now()`（line 239）
- [x] 1.5 `saveSession()` 逻辑不变：`activeSince !== null` 时才累积并重置

## 2. Harness 事件接入

- [x] 2.1 `agent_start` handler 中调用 `sessionManager.startActiveTimer()`
- [x] 2.2 `agent_end` handler 中调用 `sessionManager.stopActiveTimer()`（在现有 `trySaveSession` 之前）

## 3. Protocol 新增 `session_time` 事件

- [x] 3.1 `src/ui/shared/types.ts`: 在 `ServerEvent` union 新增 `{ type: "session_time"; totalActiveMs: number }`

## 4. WebUiBackend 定时广播

- [x] 4.1 新增 `sessionTimeInterval` 私有字段 (`ReturnType<typeof setInterval> | null`)
- [x] 4.2 新增 `startSessionTimeBroadcast()`: 启动 1s interval，每次 tick 调用 `broadcastSessionTime()`
- [x] 4.3 新增 `broadcastSessionTime()`: broadcast `{ type: "session_time", totalActiveMs: sm.getTotalActiveMs() }`
- [x] 4.4 新增 `stopSessionTimeBroadcast()`: clearInterval + 设 null
- [x] 4.5 `startAssistantMessage()`: 末尾调用 `this.startSessionTimeBroadcast()`
- [x] 4.6 `finishAssistantMessage()`: 先 `broadcastSessionTime()` 发最终值，再 `stopSessionTimeBroadcast()`

## 5. 前端 App.tsx 处理 `session_time`

- [x] 5.1 在 `handleEvent` switch 中新增 `case "session_time"`: 更新 sessions state 中当前 session 的 `totalActiveMs`

## 6. 前端 ChatView 修复

- [x] 6.1 删除 `elapsed` state: `const [elapsed, setElapsed] = useState(0);`
- [x] 6.2 删除 rAF effect: `useEffect(() => { ... tick ... rAF ... }, [turnStartRef]);`
- [x] 6.3 `WaitingBubble`: 将 `formatTime(Math.floor(sessionTime / 1000) + elapsed)` 改为 `formatTime(Math.floor(sessionTime / 1000))`
- [x] 6.4 `ThinkingBlock`: 同上修改
- [x] 6.5 `ChatViewProps`: 移除 `turnStartRef` 和 `elapsed` 相关（如无其他使用处）

## 7. 验证

- [x] 7.1 单元测试：SessionManager start/stop timer 基本行为
- [ ] 7.2 手动测试：创建新 session → 等待 5s → 发送消息，验证 totalActiveMs 不包含等待时间
- [ ] 7.3 手动测试：加载已有 session → 等待 5s → 发送消息，验证 totalActiveMs 仅包含 agent 处理时间
- [ ] 7.4 手动测试：连续多个 turn，验证时间仅累加 agent 处理段
- [ ] 7.5 手动测试：processing 期间 Sidebar 和 ChatView 时间一致且实时走表
- [ ] 7.6 手动测试：长时间 processing (30s+) 后两个计时器无漂移

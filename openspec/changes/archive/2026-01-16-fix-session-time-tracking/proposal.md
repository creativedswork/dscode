## Why

Session 时间追踪存在三个层面的 bug：

**后端 bug**：`activeSince` 在 `createSession`/`loadSession` 时即启动，到首次 `saveSession` 为止的**所有时间**（包含用户阅读历史、思考打字的空闲时间）都被计入 `totalActiveMs`。这个空闲间隔通常 ~5 秒，每次续传都会累积。

**前端 double-count bug**：`ChatView` 显示公式 `sessionTime / 1000 + elapsed` 中，`sessionTime` 已从上次 sessions 事件起包含后端 live 时间（`getTotalActiveMs()` = `accumulatedMs + (now - activeSince)`），`elapsed` 又单独计数 turn 持续时间（`now - turnStartRef`），导致 turn 内时间被 double-count。

**前端漂移 bug**：`sessions` 事件仅在 `assistant_end` 后发送一次，processing 期间 Sidebar 和 ChatView 的 `sessionTime` 均冻结。ChatView 靠 `elapsed` rAF 勉强走表，但 Sidebar 完全不走。由于 double-count，ChatView 显示的时间约等于 Sidebar 的 2 倍，**两个计时器差距随处理时长线性扩大**（处理 30s 时差距约 30s）。

## What Changes

- **SessionManager 新增 `startActiveTimer()` / `stopActiveTimer()`**：将计时控制从"持续走表"改为"agent 处理期间才走表"（✅ 已完成）
- **移除 `createSession` / `loadSession` 中的 `activeSince` 自动启动**：不再在会话创建/加载时开始计时（✅ 已完成）
- **Harness agent 事件处理中接入 timer 控制**：`agent_start` 时启动，`agent_end` 时暂停（✅ 已完成）
- **保留 `saveSession` 中的 accumulation 逻辑不变**：仅在 `activeSince !== null` 时累积（✅ 已完成）
- **WebUiBackend 新增 `session_time` 事件定时广播**：`startAssistantMessage` 时启动 1s interval 广播 `getTotalActiveMs()`，`finishAssistantMessage` 时停止
- **ChatView 去掉本地 elapsed rAF**：删除 `elapsed` state 和 `requestAnimationFrame` 计时逻辑
- **ChatView 修复显示公式**：`WaitingBubble` 和 `ThinkingBlock` 改为 `formatTime(Math.floor(sessionTime / 1000))`，不再叠加 `elapsed`
- **App.tsx 处理 `session_time` 事件**：收到事件后更新当前 session 在 `sessions` state 中的 `totalActiveMs`，Sidebar 和 ChatView 自动同步

## Capabilities

### Modified Capabilities

- `session-time-tracking`: 修改时间追踪的启停时机，从"会话生命周期"改为"agent 处理周期"
- `web-frontend`: 计时显示改为后端 `session_time` 事件驱动，消除 double-count 和双计数器漂移

### New Capabilities

- `protocol`: 新增 `session_time` 事件类型

## Impact

- **SessionManager**: 新增两个 public 方法，改动 `createSession`/`loadSession` 中的 `activeSince` 设置逻辑
- **Harness**: agent 事件 handler 中增加 `startActiveTimer()`/`stopActiveTimer()` 调用
- **WebUiBackend**: 新增 interval-based `session_time` 广播，在 `startAssistantMessage`/`finishAssistantMessage` 中启停
- **ChatView**: 删除 `elapsed` state + rAF effect，修改 `WaitingBubble`/`ThinkingBlock` 公式为 `sessionTime / 1000`
- **App.tsx**: 新增 `session_time` 事件处理，更新 sessions state 中当前 session 的 `totalActiveMs`
- **持久化兼容**：已保存 session 的 `totalActiveMs` 可能包含历史误差，新逻辑从加载后开始修复，不回溯修正

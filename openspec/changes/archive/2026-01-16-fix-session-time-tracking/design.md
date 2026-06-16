## 设计

### 现状问题

```
当前流程 (有 bug):

createSession / loadSession
    │
    │  activeSince = Date.now()  ← 从此刻开始计时
    │
    ▼
  [用户阅读历史, 思考, 打字...]  ← 空闲时间也被计入!
    │
    ▼
  agent.prompt() → agent_start → ... processing ... → agent_end
    │
    ▼
  saveSession:
    accumulatedMs += Date.now() - activeSince  ← 包含了空闲时间
```

### 修复后流程（后端 — 已完成）

```
修复后:

createSession / loadSession
    │
    │  activeSince = null  ← 不自动启动
    │
    ▼
  [用户阅读历史, 思考, 打字...]  ← 不计入
    │
    ▼
  agent_start
    │
    │  activeSince = Date.now()  ← 仅此时启动
    │
    ▼
  [... agent 处理中 ...]
    │
    ▼
  agent_end
    │
    │  accumulatedMs += Date.now() - activeSince
    │  activeSince = null  ← 暂停
    │
    ▼
  saveSession:
    if (activeSince !== null) { ... }  ← null 时不累积
    totalActiveMs = accumulatedMs
```

### SessionManager 新增 API

```typescript
// 启动计时（agent 开始处理时调用）
startActiveTimer(): void {
    if (this.activeSince === null) {
        this.activeSince = Date.now();
    }
}

// 暂停计时并累积（agent 结束处理时调用）
stopActiveTimer(): void {
    if (this.activeSince !== null) {
        this.accumulatedMs += Date.now() - this.activeSince;
        this.activeSince = null;
        if (this.current) {
            this.current.totalActiveMs = this.accumulatedMs;
        }
    }
}
```

### Harness 接入点

在 `src/core/harness.ts` 的 agent 事件订阅中：

```typescript
// agent_start (约 line 1095):
if (event.type === "agent_start") {
    this.sessionManager.startActiveTimer();
    this.ui.startAssistantMessage();
}

// agent_end (约 line 1089):
if (event.type === "agent_end") {
    this.sessionManager.stopActiveTimer();
    this.ui.setProcessing(false);
    this.sessionManager.trySaveSession(this.agent);
}
```

### SessionManager 现有改动

1. `createSession()`: 移除 `this.activeSince = Date.now()`（两处：line 97 附近和 line 115 附近）
2. `loadSession()`: 移除 `this.activeSince = Date.now()`（line 239），保留 `this.accumulatedMs = ...`

---

### 前端修复：方案 B — 后端推送统一时钟源

#### 问题分析

```
当前前端数据流：

  backend: sessions 事件（仅 agent_end 后发一次）
           │
           ▼
  App.tsx: sessionActiveMs = sessions.find(...).totalActiveMs  ← 冻结值
           │                              │
           ▼                              ▼
       Sidebar                        ChatView
  formatDuration(              sessionTime/1000 + elapsed
    s.totalActiveMs)           ↑                     ↑
                               │                     │
                          冻结，不走表           rAF 每帧+1，走表
                                                 but double-count!

  结果：
  - Sidebar: frozen (processing 期间不走)
  - ChatView: ≈ 2x real time (double-count)
  - 差距 = processing 时长，线性扩大
```

#### 修复架构

```
修复后前端数据流：

  backend: 1s interval ──► session_time { totalActiveMs } ──► agent_end 时停止
                               │
                               ▼
  App.tsx: 更新 sessions state 中当前 session 的 totalActiveMs
           │                              │
           ▼                              ▼
       Sidebar                        ChatView
  formatDuration(              formatTime(
    s.totalActiveMs)              sessionTime / 1000)
       │                              │
       └──────── 同一个值 ─────────────┘
               永远一致，实时走表
```

#### Protocol 新增

```typescript
// src/ui/shared/types.ts ServerEvent union 新增:
| { type: "session_time"; totalActiveMs: number }
```

#### WebUiBackend 改动

```typescript
// WebUiBackend 新增字段
private sessionTimeInterval: ReturnType<typeof setInterval> | null = null;

startAssistantMessage(): void {
  this.currentAssistant = { thinking: "", text: "", tools: [] };
  this.broadcast({ type: "assistant_start" });
  // ★ 启动 session_time 定时广播
  this.startSessionTimeBroadcast();
}

finishAssistantMessage(): void {
  // ★ 先发最后一次，再停止
  this.broadcastSessionTime();
  this.stopSessionTimeBroadcast();
  this.currentAssistant = null;
  this.broadcast({ type: "assistant_end" });
  // ... 现有 sessions 广播 ...
}

private startSessionTimeBroadcast(): void {
  if (this.sessionTimeInterval) return;
  this.sessionTimeInterval = setInterval(() => {
    const sm = this.harness.sessionManager;
    if (!sm) return;
    this.wsServer.broadcast({
      type: "session_time",
      totalActiveMs: sm.getTotalActiveMs(),
    });
  }, 1000);
}

private stopSessionTimeBroadcast(): void {
  if (this.sessionTimeInterval) {
    clearInterval(this.sessionTimeInterval);
    this.sessionTimeInterval = null;
  }
}

private broadcastSessionTime(): void {
  const sm = this.harness.sessionManager;
  if (!sm) return;
  this.wsServer.broadcast({
    type: "session_time",
    totalActiveMs: sm.getTotalActiveMs(),
  });
}
```

#### App.tsx 改动

```typescript
case "session_time":
  setSessions((prev) => prev.map((s) =>
    s.id === currentSessionId
      ? { ...s, totalActiveMs: event.totalActiveMs }
      : s
  ));
  break;
```

#### ChatView 改动

```typescript
// 删除 elapsed state 和 rAF effect:
// ❌ const [elapsed, setElapsed] = useState(0);
// ❌ useEffect(() => { ... rAF tick ... }, [turnStartRef]);

// WaitingBubble: 去掉 + elapsed
// 旧: ({formatTime(Math.floor(sessionTime / 1000) + elapsed)})
// 新: ({formatTime(Math.floor(sessionTime / 1000))})

// ThinkingBlock: 同上
// 旧: `Thinking... (${formatTime(Math.floor(sessionTime / 1000) + elapsed)})`
// 新: `Thinking... (${formatTime(Math.floor(sessionTime / 1000))})`

// turnStartRef prop 可保留但不再在 ChatView 内使用
// （仍由 App.tsx 管理，供 future use 或其他组件）
```

### 边界情况处理

| 场景 | 行为 |
|------|------|
| 加载 session 后直接退出 | `activeSince = null`，不累积，totalActiveMs 不变 |
| agent 处理中被 abort | `agent_end` 正常触发 → `stopActiveTimer()` 累积已处理时间；interval 在 `finishAssistantMessage` 中停止 |
| 连续多个 turn | 每个 turn 的 `agent_start`/`agent_end` 独立计时；interval 随 turn 启停 |
| `saveSession` 在 `activeSince = null` 时被调用 | 跳过 accumulation，仅保存当前 accumulatedMs |
| `getTotalActiveMs()` 在 `activeSince = null` 时被调用 | 返回 accumulatedMs（不含 live 部分） |
| 已有 session 的 totalActiveMs 包含历史误差 | 不回溯修正，新逻辑从加载后开始生效 |
| WebSocket 断开期间 | interval 继续在后端运行但 broadcast 无接收者；重连后 `pushSessionList` 发送最新值 |
| session_time 事件乱序到达 | 后端按序发送，前端幂等处理（总是更新当前 session） |

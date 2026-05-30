## Context

当前 Web UI 的"处理中"状态由三个独立路径控制：

```
handleSend ──→ setProcessing(true)
assistant_start ──→ setProcessing(true)   [冗余，值是相同的]
assistant_end ──→ setProcessing(false)    [来自 turn_end]
loader {state:"hide"} ──→ setProcessing(false) [来自 agent_end]
```

`ChatView` 中的耗时 timer 依赖 `processing` state 驱动 `useEffect` + `setInterval`。`turnStartRef` 在 `App.tsx` 中被精确设置为 `Date.now()`，但从未被读取——是死代码。

`assistant_end` 事件同时做两件事：结束消息流（设 `isStreaming=false`）和结束全局 processing 状态。这违反了单一职责，且与 `loader` 事件（`agent_end`）形成双路径竞争。

### TUI vs Web 行为对比

TUI (`tui-app.ts`) 已实现了正确的职责分离：

```
                    TUI (正确)              Web (当前/有 bug)
                    ──────────              ─────────────────
handleSubmit        setProcessing(true)      setProcessing(true)
agent_start         delegate 渲染             setProcessing(true)   ← 冗余
agent_start → turnStartRef                   Date.now()          ← 设了但从未读取
thinking_delta      delegate 渲染             reducer 更新消息
turn_end            finalizeIdleSegment      setProcessing(false)  ← ⚠️ 越权!
                    delegate 渲染             reducer 更新消息
agent_end           setProcessing(false)     setProcessing(false)  ← 冗余
```

Web 前端的 `assistant_end` handler 错误地将 "消息流结束" 等同于 "全局处理结束"。修复方案是与 TUI 行为对齐：`assistant_end`（来自 `turn_end`）只管消息流，`loader { state: "hide" }`（来自 `agent_end`）管全局 processing。

## Goals / Non-Goals

**Goals:**
- Timer 在 Thinking 阶段可靠地从 0 开始递增，不受 `processing` 状态转换时序影响
- Send/Stop 按钮在 agent 真正处理时始终显示 Stop
- 移除 `assistant_end` 中对 `setProcessing(false)` 的冗余调用
- 用 `turnStartRef`（已存在的精确时间锚点）驱动 elapsed 计算，消除对 `processing` 状态转换的脆弱依赖

**Non-Goals:**
- 不改变 WebSocket 协议
- 不改变 `processing` 状态在服务端的语义
- 不引入新的外部依赖

## Decisions

### Decision 1: `turnStartRef` 作为 timer 的时间锚点

**选择**：将 `turnStartRef`（`App.tsx` 中已有的 `useRef<number>`，在 `assistant_start` 时设为 `Date.now()`，在 `error` 时清零）作为 prop 传入 `ChatView`，由 `ChatView` 基于 ref 计算 elapsed，而非依赖 `processing` 状态驱动 `setInterval`。

**替代方案**：
- A) 修复 `processing` 状态管理但不改变 timer 机制 → 仍依赖状态转换时序，治标不治本
- B) 在 `ChatView` 中维护独立的 turn start 状态 → 与 `App` 中的 `turnStartRef` 重复，且无法感知服务端 `assistant_start` 时序

**理由**：`turnStartRef` 在服务端 `agent_start` 事件触发时被准确设置，是唯一可靠的时间锚点。timer 直接用 `Date.now() - turnStartRef.current` 计算 elapsed，通过 `useState` + `requestAnimationFrame` 循环驱动 UI 更新，完全解耦 `processing` 状态。

### Decision 2: 移除 `assistant_end` 的 `setProcessing(false)`

**选择**：`assistant_end` 只保留 reducer 调用（设 `isStreaming=false`），不再调用 `setProcessing(false)`。全局 `processing` 的结束仅由 `loader { state: "hide" }`（`agent_end`）控制。

**替代方案**：
- A) 移除 `loader` 的处理，只保留 `assistant_end` → `loader` 是 `setProcessing` 方法的标准输出，移除它会导致其他调用 `setProcessing(false)` 的路径（如 vision/OCR 失败）无法正确通知前端
- B) 两者都保留但加锁 → 增加复杂度，且不解决根本问题

**理由**：`assistant_end` 的职责是标记消息流结束（`turn_end`），不应越权控制全局 processing 状态。`agent_end` 是 agent 真正结束的信号，其后可能还有 session save 等后处理。`loader` 事件是 `UiBackend.setProcessing()` 的标准输出，覆盖所有 processing 状态变更场景。

### Decision 3: Timer 更新机制

**选择**：在 `ChatView` 中使用 `useState` + `requestAnimationFrame` 循环在 streaming 期间驱动 elapsed 更新。

```typescript
// ChatView 中
const [elapsed, setElapsed] = useState(0);
const turnStartRef = props.turnStartRef;

useEffect(() => {
  if (!turnStartRef.current) return; // 未开始
  let raf: number;
  const tick = () => {
    setElapsed(Math.floor((Date.now() - turnStartRef.current) / 1000));
    raf = requestAnimationFrame(tick);
  };
  raf = requestAnimationFrame(tick);
  return () => cancelAnimationFrame(raf);
}, [turnStartRef.current]); // 当 turnStartRef.current 从 0 变为非 0 时启动
```

**替代方案**：
- A) `setInterval` 每 500ms → 精度低，首帧延迟高
- B) `useSyncExternalStore` → 过度设计，无外部 store

**理由**：`requestAnimationFrame` 提供 ~16ms 刷新率，timer 显示用秒级 `Math.floor`，视觉上平滑且 CPU 友好。

## Risks / Trade-offs

- **[风险] `turnStartRef` prop drilling**：需要从 `App` 传到 `ChatView`，增加一个 prop。→ **缓解**：只增加一个 prop，影响范围极小。`ChatView` 已有 `processing`、`hasStreaming` 等 prop，增加一个 `turnStartRef` 是自然的扩展。
- **[风险] `requestAnimationFrame` 在后台标签页暂停**：用户切换标签页后回来，elapsed 会跳变到正确值。→ **缓解**：这是预期行为，`Date.now()` 保证时间基准正确，恢复后立即显示正确 elapsed。
- **[风险] `assistant_end` 移除 `setProcessing(false)` 后可能有场景依赖它**：其他事件（`error`、`clear_conversation` 等）仍会正确设置 processing。→ **缓解**：`agent_end` 在所有正常/异常路径都会触发，是可靠的 processing 终止信号。

## Migration Plan

1. 修改 `App.tsx`：
   - `handleEvent` 中 `assistant_end` 分支移除 `setProcessing(false)`
   - `turnStartRef` 作为 prop 传给 `ChatView`
2. 修改 `ChatView.tsx`：
   - 新增 `turnStartRef` prop
   - 移除现有基于 `processing` 的 `useEffect` timer
   - 实现基于 `turnStartRef` + `requestAnimationFrame` 的 elapsed 更新
3. 验证：发送消息 → 观察 Thinking 阶段 timer 递增 + Stop 按钮显示

无数据库迁移，无 API 变更。回滚：还原两个文件的 git diff 即可。

# Design: web-thinking-timer

## Context

当前 WebUI 的思考阶段指示链路：

```
harness: llm:thinking:delta
  → web-backend: broadcast { type: "thinking_delta", delta }
    → App.tsx: conversationReducer → message.thinking 累加
      → ChatView → AssistantMessage → ThinkingBlock
                                        ├─ 接收 sessionTime prop（从未渲染）
                                        └─ label = 静态圆点 + "Thinking"

计时基础设施:
  web-backend 每 1s broadcast { type: "session_time", totalActiveMs }
    → sessions[].totalActiveMs → sessionActiveMs → ChatView sessionTime
      → WaitingBubble 渲染 "(Xs)"   ✅ 有计时（但语义是 session 累计）
      → ThinkingBlock              ❌ 未渲染
```

关键约束：

- `sessionTime` = `SessionManager.getTotalActiveMs()`，是**跨轮次累计**的 session 活跃时间，不是本轮、更不是本段思考的耗时。
- `turnStartRef`（App.tsx）在每轮发送时设置，是**整轮**的锚点；一轮中若先有工具调用再进入思考，turn 起点远早于思考起点。
- `session_time` 广播由后端定时器驱动，只要后端存活就会 tick——它证明"后端活着"，不能证明"token 在流动"。
- 视觉规范：`warm-design-system`（无阴影无渐变、1px 边框、Geist Mono 数字用 `tabular-nums`），设计稿以 `docs/prototypes/web-thinking-timer-label-variants.html` 为准。

## Goals / Non-Goals

**Goals:**

- 流式思考期间，`ThinkingBlock` label 显示该段思考的实时耗时，圆点脉冲提供环境活性信号。
- 思考结束后 label 定格为 `Thought for Xs`，折叠态下仍可读。
- 停滞检测：超过阈值未收到 delta 时给出视觉警告，诚实地区分"长考"与"疑似卡住"。
- 零后端/协议变更，零新依赖；TUI 行为不变。

**Non-Goals:**

- 不修正 `WaitingBubble` 的计时语义（session 累计 vs 本轮等待的既有偏差，拆独立 change）。
- 不在后端引入 `thinking_start` / `thinking_end` / `thinking_stall` 事件。
- 不改 TUI 的 thinking 显示。
- 不做"自动 abort 卡住的请求"等进一步动作（只给指示，不做决策）。

## Decisions

### D1: 计时锚点 — reducer 记录 per-thinking `thinkingStartedAt`

`conversationReducer` 处理 `thinking_delta` 时：若该 message 尚无 `thinking`（本段第一个 delta），记录 `thinkingStartedAt: Date.now()`；每次 delta 同时刷新 `thinkingUpdatedAt: Date.now()`。两个字段加在 `UIMessage`（`src/ui/shared/types.ts`）上，可选，不持久化、不进协议。

**为什么不用 `sessionTime`**：session 累计时间在长 session 中显示 "47m 12s"，对"本次思考多久"毫无意义。
**为什么不用 `turnStartRef`**：一轮中工具调用与思考交替，turn 起点 ≠ 思考起点；且 turnStartRef 在 App 层，ThinkingBlock 拿它要继续穿 prop，语义仍不对。
**为什么放 reducer 而非组件内**：delta 事件先经过 reducer，这里是唯一能精确捕获"第一个 delta"时机的位置；组件内用 `useEffect` 监听 `thinking` 从 undefined 出现也能做，但依赖渲染时序，不如事件时序精确。

### D2: tick 来源 — ThinkingBlock 内本地 `setInterval(1s)`

流式期间组件挂本地 1s interval 驱动重渲染，结束/卸载时清理。

**为什么不复用 `session_time` 广播**：它能省一个定时器，但把思考计时的跳动耦合到后端广播的存活与节奏上（广播只在 session timer 运行期间存在）；本地 interval 自包含、语义清晰，代价是每组件一个定时器——同一时刻只有一个流式 ThinkingBlock，可忽略。

### D3: 停滞检测 — 纯前端，基于 `thinkingUpdatedAt`

ThinkingBlock 的 1s tick 中同时计算 `now - thinkingUpdatedAt`，超过 **15s** 进入 stalled 态：`.thinking` 加 `stalled` class（左边框与圆点变 `--color-warning-text`，圆点脉冲放缓至 2s），label 追加 `no output for Xs`（warning 色）。新 delta 到达 → `thinkingUpdatedAt` 刷新 → 自动恢复正常态。阈值定为常量，不暴露配置。

**为什么不加后端事件**：停滞是"没有事件"的状态，后端检测需要额外 watchdog 定时器与协议字段；前端已有每个 delta 的时间戳，本地计算等价且零成本。
**阈值 15s**：原型演示用 3s 仅为可见性；真实模型长考时 delta 间隔通常 <5s，15s 足以过滤正常波动又不至于让用户等太久。

### D4: 定格总结 — `Thought for Xs`

思考结束（reducer 收到 `text_delta` / `tool_start` / `assistant_end` 且该 message 有 `thinking`）时，`thinkingStartedAt` 停止更新语义上的计时；组件检测到 `isStreaming` 结束或正文/工具出现后，label 切换为 `Thought for {finalElapsed}`，圆点静止（opacity 0.35），body 按现有行为自动折叠。最终耗时在组件内由"结束时刻 - thinkingStartedAt"冻结，不需要 reducer 额外字段。

**为什么改文案而不是停在 `Thinking · 23s`**：`Thought for Xs`（Claude Code 风格）用过去时明确表达"已结束"，折叠后扫一眼即知思考成本；保留 `Thinking` 仅停止跳动，用户仍需靠"数字动不动"判断状态，认知成本高。

### D5: 多段思考 — 各段独立计时

一轮中 thinking → tool → thinking 交替时，新一段思考的第一个 delta 重置 `thinkingStartedAt`（reducer 中判断条件：`msg.thinking` 在上一段结束后已被"封存"——实现上以"自上次 delta 后出现过 text_delta/tool_start"为分段信号；简单实现：reducer 在 `text_delta`/`tool_start` 时清除 `thinkingStartedAt`，下一段 thinking 的首个 delta 重新记录）。每段独立显示耗时，符合"现在这段思考进行多久了"的直觉。

**替代方案（累加所有段）**：显示"本轮累计思考 Xs"也有价值，但与停滞检测、定格文案（`Thought for Xs` 指哪段？）交互复杂，独立分段更简单诚实。

### D6: 视觉规格（以原型为准）

- 计时数字：Geist Mono + `tabular-nums`，格式复用现有 `formatTime()`（`<60s` → `12s`，`≥60s` → `2m 5s`），与 WaitingBubble 一致。
- 流式圆点脉冲：`opacity 0.35↔1 + scale 1↔1.25`，1.2s ease-in-out infinite；stalled 时放缓为 2s 且变色。
- stalled 左边框：`border-left-color: var(--color-warning-text)`，复用现有 `transition: border-color 0.3s`。
- 遵循 `prefers-reduced-motion`：脉冲动画在该媒体查询下禁用（与现有 fade-up 动画的处理一致）。

### D7: Phase label cascade — `data-collider="phase-label"`

`TransitionCanvas.buildRowList()` queries `container.querySelectorAll("[data-collider]")` and skips elements with nested `[data-collider]` children (leaf-only selection). The `.phase-label` divs in `AssistantMessage` carry no `data-collider` attribute and are therefore invisible to the cascade engine — they survive the animation and remain visible until the React view switch unmounts `ChatView`.

**Fix**: Add `data-collider="phase-label"` to the three `.phase-label` `<div>` elements in `AssistantMessage` (Thinking L388, Executing L405, Response L439 in `ChatView.tsx`). No CSS or JS changes required — the existing cascade engine handles `[data-collider]` elements uniformly, and `.phase-label` in the dashboard context never renders.

**为什么不用 CSS-only 方案**：可以用 `.phase-label { display: none }` 在 viewMode 切换时隐藏，但这样 phase labels 会在动画中途突然消失（跳变），而 cascade 方案提供自然的逐渐消散效果，视觉连续性更好。

## Risks / Trade-offs

- **[Date.now() 时钟回拨/休眠唤醒导致计时跳变]** → 影响仅限显示数字，可接受；如需严谨可用 `performance.now()`，但跨 reducer/组件传递语义不如 epoch 直观，不做。
- **[历史消息重放（ready 事件重建会话）时无 `thinkingStartedAt`]** → 字段可选，缺失时不渲染计时，label 退化为现有静态样式；历史消息 `isStreaming=false`，本就显示定格/静态态，无影响。
- **[ stalled 误报：模型长考但 delta 稀疏（如某些 provider 缓冲输出）]** → 阈值 15s 已留余量；stalled 只是 warning 色提示而非 error，不打断流程，delta 恢复即自愈。
- **[多段思考的分段信号依赖 reducer 事件顺序]** → `text_delta`/`tool_start` 清除 anchor 的规则简单确定；若未来出现"thinking 与 text 交错 delta"的 provider，分段会退化为连续计时，显示仍正确（只是不重置），可接受。
- **[本地 interval 与后端 session_time 双计时源并存]** → 两者语义不同（本段思考 vs session 累计），UI 上分别出现在 ThinkingBlock 与 WaitingBubble，不同屏竞争；WaitingBubble 语义修正留待后续 change 统一处理。

## Open Questions

- 无阻塞性问题。`WaitingBubble` 计时语义偏差已记录为后续独立 change 候选。

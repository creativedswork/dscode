# Prototype: web-thinking-timer

## Prototype Files

- `docs/prototypes/web-thinking-timer-label-variants.html` — ThinkingBlock 计时与活性指示的变体对比原型（light/dark 双主题，对齐 warm-design-system tokens）。包含：
  - **Live Simulation**：完整生命周期模拟（Waiting → Thinking 流式计时 → 定格折叠 → 正文流出），支持 `simulate stall` 开关演示 delta 中断。
  - **变体 A / A′（实时计时）**：label 显示 `Thinking · 12s` / `2m 5s`，圆点脉冲，`tabular-nums` 等宽数字。
  - **变体 B / B′（定格总结）**：结束后 label 定格 `Thought for 23s`，折叠/展开两态。
  - **变体 C（停滞检测）**：超阈值无 delta 时边框/圆点变 warning 色，label 追加 `no output for Xs`。

## Confirmed Design Decisions

explore 阶段经原型视觉迭代确认（对应 design.md 的 D1–D6）：

1. **计时语义**：per-thinking anchor（`thinkingStartedAt`），不复用 session 累计的 `sessionTime`。
2. **定格文案**：`Thought for Xs`（Claude Code 风格），折叠后保留。
3. **停滞检测**：warning 色边框 + `no output for Xs`，delta 恢复后自愈；演示阈值 3s，实现阈值 15s。
4. **数字样式**：Geist Mono + `tabular-nums`，复用现有 `formatTime()` 规则，与 WaitingBubble 一致。
5. **圆点脉冲**：流式期间 1.2s ease-in-out；stalled 时放缓至 2s 并变色。

## Prototype Status

Prototype confirmed — 实现时以该 HTML 为视觉基准。

# Proposal: web-thinking-timer

## Why

WebUI 在模型流式输出 thinking 期间没有任何计时或活性指示：`WaitingBubble`（带计时）在第一个 `thinking_delta` 到达后即消失，接管画面的 `ThinkingBlock` 只有一个静态 label 和静止圆点——用户无法区分"模型正在长考"与"请求已卡住"。

调查还发现这是一个**规格与实现的落差**：`web-frontend` spec 的 "Processing timer driven by turn start anchor" 要求 `ThinkingBlock` 显示 `Thinking... (Xs)`，但实现中 `ThinkingBlock` 接收了 `sessionTime` prop 却从未渲染（半成品 plumbing）。且 `sessionTime` 语义上等于 session 累计活跃时间（`getTotalActiveMs()`），直接渲染它在长 session 中会显示 "47m 12s" 这类无意义数字。

## What Changes

- **实时思考计时**：`ThinkingBlock` 流式期间在 label 显示**每次思考独立**的已耗时长（`Thinking · 12s`），从该段思考的第一个 `thinking_delta` 起算；label 圆点增加脉冲动画作为活性指示。
- **定格总结**：思考结束（首个 `text_delta` / `tool_start` 或 `assistant_end`）时 label 定格为 `Thought for 23s`（Claude Code 风格），折叠后保留该摘要，不再跳动。
- **停滞检测**：流式期间若超过 15s 未收到 `thinking_delta`，进入 stalled 态——左边框与圆点变为 warning 色，label 追加 `no output for Xs`；delta 恢复后自动回到正常流式态。纯前端基于 delta 时间戳计算，无后端新事件。
- **规格语义修正**：将 `web-frontend` spec 中 thinking 计时的锚点从 `turnStartRef`（turn 起点）修正为 per-thinking anchor（该段思考起点），多段思考各自独立计时。

**Out of scope**：`WaitingBubble` 当前实现使用 `sessionActiveMs`（session 累计）而非 spec 要求的 `turnStartRef`（本轮等待）——这是既有偏差，建议拆独立 change 处理，本 change 不动 `WaitingBubble`。

## Capabilities

### New Capabilities

（无）

### Modified Capabilities

- `web-frontend`: 修改 "Processing timer driven by turn start anchor" 中 thinking 场景的计时锚点语义（turnStartRef → per-thinking anchor）；为 `ThinkingBlock` 新增流式计时显示、结束定格总结、停滞检测三项需求。

## Impact

- **前端代码**：
  - `web/src/components/ChatView.tsx` — `ThinkingBlock` 渲染计时/定格/停滞态，本地 1s tick
  - `src/ui/shared/reducer.ts` — `thinking_delta` 时记录 `thinkingStartedAt` / `thinkingUpdatedAt`
  - `src/ui/shared/types.ts` — `UIMessage` 新增上述两个可选字段
  - `web/src/index.css` — 圆点脉冲动画、stalled 态 warning 样式
- **协议/后端**：无变更（停滞检测纯前端基于 delta 时间戳）
- **TUI**：无变更（TUI 的 thinking 显示不在本 change 范围）
- **设计依据**：`docs/prototypes/web-thinking-timer-label-variants.html`（explore 阶段已确认的原型，含 A 实时计时 / B 定格总结 / C 停滞检测三变体与完整生命周期模拟）

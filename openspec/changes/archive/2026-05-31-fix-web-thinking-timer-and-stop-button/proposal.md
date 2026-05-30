## Why

Web UI 在模型 Thinking 阶段存在两个 UI 状态同步 bug：(1) 计时器始终显示 0s 不递增；(2) 发送按钮偶发不切换为停止按钮。两个 bug 同根：Web 前端 `assistant_end` handler 越权调用了 `setProcessing(false)`，而 TUI 的 `finishAssistantMessage` 正确地只管消息流——同样的 `UiBackend` 接口，Web 端行为与 TUI 不一致。

## What Changes

- **移除 `assistant_end` 中对 `setProcessing(false)` 的调用**：`assistant_end`（来自 `turn_end`）的职责是结束消息流（设 `isStreaming=false`），不应同时控制全局 `processing` 状态。`processing` 的结束仅由 `loader { state: "hide" }`（来自 `agent_end`）控制，避免重复设置和时序竞争。
- **用 `turnStartRef` 驱动耗时计时**：将 `turnStartRef` 从 `App` 通过 props 传入 `ChatView`，`ChatView` 直接用 `Date.now() - turnStartRef` 计算 elapsed，不再依赖 `processing` 状态驱动的 `setInterval`。消除 timer 启停对 `processing` 状态转换时序的脆弱依赖。
- **`ChatView` 移除独立的 timer `useEffect`**：`elapsed` 改为基于 `turnStartRef` 的计算属性，使用 `useSyncExternalStore` 或轻量 `useState` + `requestAnimationFrame` 循环在 streaming 期间持续更新。

## Capabilities

### New Capabilities
<!-- No new capabilities — this is a bug fix for existing functionality -->

### Modified Capabilities
- `web-frontend`: Timer display and processing state management in ChatView and App components are reworked. The `turnStartRef` becomes the authoritative time source, and `assistant_end` no longer resets the global `processing` flag.

## Impact

- **Affected code**: `web/src/components/App.tsx`（移除 `assistant_end` 分支的 `setProcessing(false)`，`turnStartRef` 作为 prop 下传），`web/src/components/ChatView.tsx`（timer 逻辑重写，基于 `turnStartRef` 计算 elapsed）
- **No API changes**: 仅前端内部重构，WebSocket 协议不变
- **No dependency changes**

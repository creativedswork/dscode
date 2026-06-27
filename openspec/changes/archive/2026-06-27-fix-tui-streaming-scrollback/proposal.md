## Why

TUI 中 LLM 流式输出时，每个 token delta 都触发 `renderLive()` → `tui.requestRender(true)` → `fullRender(true)`，后者发出 `\x1b[3J`（Erase Scrollback），导致终端 scrollback 缓冲区被持续清空。用户无法向上滚动浏览历史内容，只能被动卡在最底部。

## What Changes

- `ConversationView.renderLive()` 将 `tui.requestRender(true)` 改为 `tui.requestRender(false)`，走差分渲染路径，不再触发 scrollback 清除
- 流式输出期间，终端 scrollback 完整保留，用户可自由向上滚动（鼠标滚轮 / Shift+PgUp）
- 已完成的 blocks 不受影响（`render()` 始终走 `requestRender(true)`，确保确定性全量渲染）

## Capabilities

### New Capabilities
- `tui-streaming-scrollback`: 流式输出期间终端 scrollback 不被清空，用户可自由翻阅历史

### Modified Capabilities
<!-- None — 纯 bug 修复，不改变任何 spec 级需求 -->

## Impact

- `src/ui/conversation.ts` — `renderLive()` 方法，`line 606`: `this.tui.requestRender(true)` → `this.tui.requestRender(false)`
- 依赖 pi-tui 差分渲染的正确性（`appendStart`、`firstChanged`/`lastChanged` 路径处理内容增长的行变更）

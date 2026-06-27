## Context

当前 `ConversationView.renderLive()` 在每次被调用时（每个 token delta / thinking delta / tool 状态变更）都会调用 `tui.requestRender(true)`。`force=true` 会让 pi-tui 重置内部状态（`previousLines=[]`, `cursorRow=0` 等），从而强制走 `fullRender(true)` 路径，发出 `\x1b[2J\x1b[H\x1b[3J` 序列——清屏、光标归位、清除 scrollback。

这导致终端 scrollback 缓冲区在流式输出期间被持续破坏，用户永远无法向上滚动查看历史内容。

pi-tui 的 `requestRender(false)`（force=false）路径使用差分渲染：比较新旧渲染行，只更新变化的部分。它支持行追加（`appendStart` 路径）、行内容修改（`firstChanged`/`lastChanged` 路径）、行缩减（`clearOnShrink` 路径）。所有这些路径都不发送 `\x1b[3J`。

## Goals / Non-Goals

**Goals:**
- 流式输出期间终端 scrollback 完整保留
- 用户可以用鼠标滚轮或 Shift+PgUp 正常翻阅历史
- 流式输出的视觉效果不受影响（无闪烁、无跳帧）

**Non-Goals:**
- 不实现 TUI 内自定义滚动 UI（如 vim 式的滚动窗口）
- 不改变 pi-tui 框架代码
- 不修改 `render()`（已完成 blocks 的渲染方式保持不变）

## Decisions

### Decision 1: 只改 `renderLive()` 的 force 参数

`renderLive()` 调用 `tui.requestRender(true)` → `tui.requestRender(false)`。

**Why not modify pi-tui framework:** pi-tui 的 `fullRender` 中 `\x1b[3J` 在终端 resize、初次渲染等场景下是正确的行为。只在流式渲染中抑制即可，不需要改动框架。

**Why not add a parameter to requestRender:** 增加 `clearScrollback` 参数需要改框架 API，影响范围大。

**Why not wrap renderLive in debounce/throttle:** pi-tui 自带的 `MIN_RENDER_INTERVAL_MS=16` 和 requestRender 的 schedule 机制已经做了帧率管控。额外节流不会改善 scrollback 问题（根因是 `\x1b[3J` 而非渲染频率）。

### Decision 2: 保持 `render()` 的 `force=true` 不变

`ConversationView.render()` 处理已确定的 block 追加（用户消息、助手完成消息、info/error 等），走全量渲染路径是合理的：block 是单次追加的，不是高频连续的，`force=true` 提供确定性清屏行为。此处不需要改动。

## Risks / Trade-offs

- **[Risk] 差分渲染在快速内容变化时可能出现视觉残留** → `renderLive()` 在每次调用前会先 remove 所有 live 子组件再重建，这确保 Box 的子组件列表与预期一致。pi-tui 的差分比较基于渲染后的行文本，与子组件列表无关。若出现残留，可通过增加 `force=true` 的兜底触发来修复。

- **[Risk] `currentAssistantText` 内容缩短（如编辑撤回）导致行数缩减** → pi-tui 有 `clearOnShrink` 路径，默认开启（`PI_CLEAR_ON_SHRINK=1` 默认为 falsy，但 `clearOnShrink` 属性默认为 `false`... 需要验证）。如果内容缩减且不清屏，旧行可能残留。`thinkingBuffer` 和 `currentAssistantText` 都是 monotonic 增长的（只在 `startAssistantMessage()` 时重置），不会出现中途缩减的情况。Tool 的 `renderedToolCount` 也是 monotonic。

- **[Risk] 内容行数增长导致 terminal 自动 scroll 出用户当前视口** → 这是终端模拟器的默认行为：向底部追加内容时，如果用户在 scrollback 中，终端会停留在用户位置（不 auto-scroll）。如果用户在底部（实时视图），终端的 auto-scroll 会让用户跟随新内容。这正是期望的行为。

## Open Questions

- `PI_CLEAR_ON_SHRINK` 的默认行为需要确认。如果内容缩减时不清屏，`renderLive()` 在 `startAssistantMessage()` 重置后可能出现残留。建议在 `startAssistantMessage()` 中额外调用一次 `requestRender(true)` 作为状态边界清理。

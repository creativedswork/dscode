## Context

pi-tui 的渲染由 input 事件驱动。当 `requestRender(true)` 在 input listener 调用栈内执行时（如同步的 `insertTextAtCursor`），render 立即生效。但在异步回调（`.then()` / `queueMicrotask`）中调用 `requestRender(true)` 时，pi-tui 的 render timer 可能不在活跃状态，无法触发可见刷新——用户必须按任意键产生新 input 事件才能看到更新。

当前两个异步图片插入路径：
- **`pasteClipboardImage()`**: `osascript` 通过 `readClipboardImageNonBlocking()` 异步返回 → `.then(img => addImage(img))`
- **`handleKittyProtocol()`**: `queueMicrotask(() => addImage(img))` —— 这个在微任务中执行，理论上微任务在当前 task 结束前执行，但也受限于 pi-tui 的渲染状态

## Goals / Non-Goals

**Goals:**
- 异步回调中调用 `addImage` 后，`[image:N]` placeholder 立即可见，无需用户额外输入
- `pasteClipboardImage()` 和 `handleKittyProtocol()` 两条路径都受益

**Non-Goals:**
- 不改变 paste 事件的路由逻辑（Kitty vs bracketed vs Cmd+V 的分发）
- 不改变 ImageManager / ImagePasteHandler 的核心接口
- 不修改 `readClipboardImageNonBlocking()` 的 osascript 执行逻辑

## Decisions

### Decision 1: 在 `addImage` 的 `requestRender(true)` 后追加 `tui.scheduleRender()` 调用

`requestRender(true)` 设置了 dirty flag，但异步回调中 pi-tui 没有 pending timer 来 pick it up。需要额外确保 render 被调度。

**替代方案**:
- ❌ 在 `.then()` 中手动调用两次 `requestRender` —— hack，不解决问题本质
- ❌ 把 osascript 改成同步 (`execSync`) —— 阻塞 UI 3 秒，不可接受
- ✅ 在 `addImage` 的 `updateStatus` 中已调用 `requestRender(true)`，只需确保 render timer 被触发。方案：在 `addImage` 或 `pasteClipboardImage` 的异步回调中，调用 `tui.scheduleRender()`（如果 pi-tui 暴露此 API）或等价的强制刷新手段

**实际方案**: 在 `pasteClipboardImage` 和 `handleKittyProtocol` 的异步回调中，`addImage` 之后追加一次带延迟的 `requestRender(true)`（`setTimeout(() => tui.requestRender(true), 0)`），确保在当前事件循环结束后触发渲染。

### Decision 2: 不改 `ImagePasteHandler.addImage` 的接口

`addImage` 已经调用了 `requestRender(true)`（通过 `updateStatus`），问题不在 `ImagePasteHandler` 层面，而在调用方（异步回调）没有正确处理 pi-tui 的渲染时序。修复点应在 `tui-app.ts` 的异步回调中，不改变 `image-paste-handler.ts`。

## Risks / Trade-offs

- [Risk] `setTimeout(0)` 可能在某些情况下仍有渲染延迟 → Mitigation: 可用 `setTimeout(0)` 确保在 next macrotask 中触发，这是可接受的最小延迟（<1 frame）
- [Risk] `handleKittyProtocol` 的 `queueMicrotask` 理论上在当前 task 结束前执行，但如果 pi-tui 的 render 在 macrotask 中驱动，微任务回调中 `requestRender(true)` 确实不会生效 → Mitigation: 同样用 `setTimeout(0)` 包裹

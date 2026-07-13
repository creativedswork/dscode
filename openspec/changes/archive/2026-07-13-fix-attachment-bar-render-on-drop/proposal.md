## Why

两个关联的 TUI prompt bug：

**Bug 1 — attachment bar 不立即渲染**

拖拽文件到 TUI prompt 后，attachment bar 不立即显示，必须按 ⬇️ 等触发重新渲染后才能看到。根因是 `updateAttachmentBar()` 更新了 `Text` 组件的状态但从未调用 `requestRender()`，而文件拖放输入被 input listener 以 `consume: true` 消费，导致 TUI 的 `handleInput` 提前返回，跳过了 render 调用。`ImagePasteHandler.updateStatus()` 已正确处理此问题，需要为 `updateAttachmentBar()` 补齐。

**Bug 2 — 拖入文件后 ⬅️➡️ 无法控制光标**

拖入文件后 `fileTracker.count > 0`，`handleInput()` 无条件消费 `Key.left` / `Key.right` 用于滚动 attachment bar，导致 Editor 组件永远收不到方向键，光标无法在文本中移动。

## What Changes

- 在 `TuiApp.updateAttachmentBar()` 末尾添加 `this.tui.requestRender(true)`，与 `ImagePasteHandler.updateStatus()` 保持一致
- 将 attachment bar 滚动的快捷键从 `Key.left` / `Key.right` 改为 `Key.ctrlShift("left")` / `Key.ctrlShift("right")`，纯方向键 pass through 给 Editor
- 更新 attachment bar hint 文案：`← → scroll` → `Ctrl+Shift+← → scroll`

- `src/ui/tui-app.ts`:
  - `updateAttachmentBar()` — 加一行 `this.tui.requestRender(true)`（Bug 1）
  - `handleInput()` — `Key.left/right` → `Key.ctrlShift("left")` / `Key.ctrlShift("right")`（Bug 2）
  - 更新 hint 文案（Bug 2）
- 无 API 变更，无 breaking change
### New Capabilities
<!-- 无新增能力，纯 bug fix -->

### Modified Capabilities
<!-- 无 spec 级行为变更 -->

## Impact

- `src/ui/tui-app.ts` — `updateAttachmentBar()` 方法，加一行 `this.tui.requestRender(true)`
- 无 API 变更，无 breaking change

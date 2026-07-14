## Context

`TuiApp.updateAttachmentBar()` 负责渲染 file attachment bar（位于 conversation 区和 editor 之间）。它更新 `this.imageStatus`（一个 `Text` 组件）的文本内容，但从不触发渲染。

对比同类方法 `ImagePasteHandler.updateStatus()`（`image-paste-handler.ts:86-92`），后者在 `setText` 之后正确调用了 `this.tui.requestRender(true)`。

文件拖放输入在 TUI input listener 中被消费（返回 `{ consume: true }`），导致 pi-tui 的 `handleInput` 提前返回，不执行末尾的 `requestRender()`。这使得无 render 调用的状态变更永久不可见，直到下次偶然触发渲染（如按 ⬇️）。

## Goals / Non-Goals

**Goals:**
- 文件拖放到 TUI prompt 后，attachment bar 立即显示，无需额外按键触发

**Non-Goals:**
- 不改变 attachment bar 的布局逻辑
- 不改变 `FileTracker` 或 `ImagePasteHandler` 的工作方式
- 不修改 pi-tui 框架

## Decisions

**策略 1（Bug 1）：在 `updateAttachmentBar()` 末尾加 `this.tui.requestRender(true)`**

与 `ImagePasteHandler.updateStatus()` 完全一致的写法。这是最小改动，只补缺失的 render 调用。

备选方案：
- 在文件 drop handler（`handlePasteImage` line 833）中单独加 `requestRender` — 拒绝，因为 `updateAttachmentBar` 还在多处被调用（onChange、箭头键滚动、Esc 清除），每处都补不如在方法内集中处理
- 修改 pi-tui 让 `setText` 自动触发 render — 拒绝，属于框架层变更，影响面大且不在本 repo 内

**策略 2（Bug 2）：改为 `Key.ctrlShift("left")` / `Key.ctrlShift("right")` 滚 attachment bar**

纯方向键不再被 `handleInput()` 消费，直接 pass through 给 Editor。修饰键组合 `ctrl+shift` 未被 Editor 使用（alt+⬅️➡️ 和 ctrl+⬅️➡️ 已被逐词跳转占用，shift+⬅️➡️ 可能被终端拦截），是唯一零冲突的选项。同步更新 hint 文案。

备选方案：
- 边界感知 pass-through（光标在文本边界时才滚 attachment bar）— 拒绝，用户倾向于清晰的按键分工
- 去掉 attachment bar 键盘滚动功能 — 拒绝，多文件时仍需键盘导航

## Risks / Trade-offs

- [Risk] `updateAttachmentBar` 在 Editor `onChange` 中也频繁调用（每次输入），会导致额外渲染 → 可忽略：pi-tui 有 `MIN_RENDER_INTERVAL_MS` 限流，且 `requestRender(true)` 的 force 参数在 16ms 内有去抖

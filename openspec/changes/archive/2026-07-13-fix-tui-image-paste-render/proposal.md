## Why

Ghostty 终端下 Cmd+V 粘贴截图后，TUI prompt 中不显示图片 placeholder——图片实际已通过 `osascript` 读到，但异步回调中的 `insertTextAtCursor` + `requestRender` 未触发可见刷新，用户只能看到空 editor，提示用 `/image` 手动加载。问题在 pi-tui 升级启用 Kitty keyboard protocol 后暴露（Ghostty 不再内联发送 Kitty APC 图片数据），但根因是异步图片插入后渲染不刷新，属已有代码缺陷。

## What Changes

- 修复 `pasteClipboardImage()` 异步回调中图片插入后 UI 不刷新的问题
- 确保异步插入的 `[image:N]` placeholder 立即可见，不依赖用户后续输入触发渲染
- 修复 `handleKittyProtocol` 中 `queueMicrotask` 插入图片后的同样渲染问题（预防性修复）

## Capabilities

### New Capabilities
- `tui-async-image-render`: 异步图片插入（osascript/queueMicrotask）后触发可见 UI 刷新

### Modified Capabilities
- `tui-draft-image-sync`: 异步回调中 insertPlaceholder 后需要强制刷新渲染

## Impact

- `src/ui/tui-app.ts`: `pasteClipboardImage()` 和 `handleKittyProtocol()` 的异步回调
- `src/ui/image-paste-handler.ts`: 无变更（`addImage` 已有的 `requestRender(true)` 在同步路径足够）

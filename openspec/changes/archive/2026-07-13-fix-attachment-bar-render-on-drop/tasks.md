## 1. Implementation

- [x] 1.1 在 `src/ui/tui-app.ts` 的 `updateAttachmentBar()` 方法末尾添加 `this.tui.requestRender(true)`，位于 `this.imageStatus.setText(...)` 之后
- [x] 1.2 将 `handleInput()` 中 attachment bar 滚动的快捷键从 `Key.left` / `Key.right` 改为 `Key.ctrlShift("left")` / `Key.ctrlShift("right")`
- [x] 1.3 更新 attachment bar hint 文案：`← → scroll` → `Ctrl+Shift+← → scroll`

- [x] 2.1 `npm run build` 编译通过
- [ ] 2.2 拖放文件到 TUI prompt，验证 attachment bar 立即显示，无需按 ⬇️
- [ ] 2.3 粘贴图片到 TUI prompt，验证 status bar 正常显示（确认无回归）
- [ ] 2.4 按 Ctrl+Shift+⬅️/➡️ 滚动 attachment bar，验证立即刷新
- [ ] 2.5 按 Esc 清除 attachment bar，验证立即消失
- [ ] 2.6 拖入文件后，纯 ⬅️➡️ 键验证光标可在 Editor 文本中正常移动
- [ ] 2.7 无文件拖入时，⬅️➡️ 键验证光标移动正常（无回归）

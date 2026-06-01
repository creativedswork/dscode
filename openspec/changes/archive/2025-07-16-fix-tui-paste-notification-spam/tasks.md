## 1. 在 TUI inputListener 中添加大段文本 paste 通知

- [x] 1.1 在 `handlePasteImage` 的纯文本 paste 分支（当前 `return undefined` 处），添加大段 paste 判断：若 `pasteContent` 超过阈值（>10 行或 >1000 字符），调用 `this.conversation.addInfo()` 显示通知一次。通知格式与当前 onChange 中保持一致。

## 2. 从 onChange 中移除 paste 通知逻辑

- [x] 2.1 在 `this.editor.onChange` 回调中，删除 paste 标记正则匹配及 `addInfo` 调用的代码块（第 182-185 行），保留 image 占位符同步逻辑不变。

## 3. 验证

- [x] 3.1 运行 `npm run typecheck` 确认类型无错误
- [ ] 3.2 手动测试：在 TUI 中粘贴大段文本（>10 行），确认只显示一次通知，后续打字不再重复
- [ ] 3.3 手动测试：粘贴短文本（<10 行、<1000 字符），确认不显示通知
- [ ] 3.4 手动测试：粘贴大段文本后按 Enter 提交，再粘贴另一段大文本，确认新粘贴显示新通知

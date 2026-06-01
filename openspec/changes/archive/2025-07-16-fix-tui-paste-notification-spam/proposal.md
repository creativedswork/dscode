## Why

TUI 提示框中粘贴大段文本后，系统会插入 `[paste #N +X lines]` 占位标记并显示一次通知。但通知逻辑错误地放在 `Editor.onChange` 中——每次按键（文本变化）都触发正则匹配，而标记在提交前始终存在，导致每个后续按键都重复弹出 "Large paste accepted" 通知，刷屏会话。

## What Changes

- 将大段粘贴通知从 `Editor.onChange`（状态轮询）移至 TUI `addInputListener` 的 paste 处理流程（事件驱动）
- `handlePasteImage` 在检测到纯文本 bracketed paste 时，判断是否超过大段粘贴阈值，若超过则显示通知**一次**
- 从 `onChange` 中移除 paste 标记正则匹配逻辑，保留 image 占位符同步逻辑不变
- 不影响 Editor 内部的 paste 标记机制（插入标记、按 Enter 展开内容的行为完全保留）

## Capabilities

### New Capabilities
<!-- 无新增能力，纯 bug 修复 -->

### Modified Capabilities
<!-- 不改变任何 spec 级需求，仅修正实现 -->

## Impact

- 受影响文件：`src/ui/tui-app.ts`
- 无 API 变更，无依赖变更，无 breaking changes
- 不影响 pi-tui Editor 的 paste 标记机制

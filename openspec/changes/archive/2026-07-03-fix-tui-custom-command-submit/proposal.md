## Why

TUI 中用户选择自定义 command 后按回车无任何反应。根因是 `handleSubmit` 中错误地将展开后的 prompt 文本传给了原始键盘事件处理器 `handleInput` 而非正确的提交流程。

## What Changes

- 修复 `src/ui/tui-app.ts`：将 `this.handleInput(expanded)` 改为 `this.handleSubmit(expanded)`，使自定义 command 展开后的文本正确进入 AI 对话流程
- 清理 `handleSubmit` 中的重复 `/` 命令检查代码块（L1122-L1128，合并残留）

## Capabilities

### New Capabilities
<!-- No new capabilities — pure bug fix -->

### Modified Capabilities
<!-- No requirement changes — implementation-only fix -->

## Impact

- `src/ui/tui-app.ts` — 修正 `handleSubmit` 方法中的方法调用和死代码清理
- Web 后端无影响（`web-backend.ts` 中 `handleSlashCommand` 已正确处理）

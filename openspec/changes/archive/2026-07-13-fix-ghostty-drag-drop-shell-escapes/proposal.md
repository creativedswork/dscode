## Why

Ghostty 终端拖放文件到 TUI prompt 时，对路径中包含空格的字符做 shell-style 转义（`\ `），导致 `handlePasteImage` 中的 `existsSync` 检查失败，文件无法被跟踪，不显示 `[file:xxx]` placeholder。

此问题对不含空格的文件名（如 `readme.md`、`index.js`）无影响，仅当路径含空格时出现。

## What Changes

- 在 `handlePasteImage` 的路径检测逻辑中，`existsSync` 之前对 paste 内容做 shell escape 反转义（`\ ` → ` `），使 Ghostty 转义后的路径能正确匹配真实文件

- `src/ui/tui-app.ts`:
  - `handlePasteImage()` — 新增 `unescaped` 变量，`replace(/\\(.)/g, "$1")` 反转义后用于 `existsSync` 和 `fileTracker.add`

### New Capabilities
<!-- 纯 bug fix，无新增能力 -->

### Modified Capabilities
<!-- 无 spec 级行为变更 -->

## Impact

- `src/ui/tui-app.ts` — `handlePasteImage()` 方法内新增 2 行
- 无 API 变更，无 breaking change

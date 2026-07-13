## 1. Implementation

- [x] 1.1 在 `src/ui/tui-app.ts` 的 `handlePasteImage()` 方法中，`existsSync` 之前新增 `unescaped` 变量做 shell escape 反转义
- [x] 1.2 `fileTracker.add` 改用 `unescaped`（真实路径）

- [x] 2.1 `npm run build` 编译通过
- [x] 2.2 拖放含空格的 PDF 文件到 Ghostty TUI prompt，验证 `[file:xxx]` placeholder 正确显示

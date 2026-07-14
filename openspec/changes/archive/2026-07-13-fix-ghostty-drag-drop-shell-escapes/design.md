## Context

Ghostty 终端在拖放文件时，对 bracketed paste 中的路径做 shell-style 转义。例如：

```
真实路径: /Users/x/Documents/From Prompts to Templates.pdf
发送数据: \x1b[200~/Users/x/Documents/From\ Prompts\ to\ Templates.pdf\x1b[201~
```

`handlePasteImage` 从 bracketed paste 中提取 `pasteContent` 后直接调用 `existsSync(pasteContent)`，转义后的路径自然匹配不到真实文件。

## Goals / Non-Goals

**Goals:**
- 拖放含空格的文件到 TUI prompt 后，`[file:xxx]` placeholder 正确显示

**Non-Goals:**
- 不改变其他终端的拖放行为
- 不影响粘贴图片的 Kitty protocol 处理
- 不修改 pi-tui 框架

## Decisions

**策略：在 `existsSync` 前做 shell escape 反转义**

使用 `replace(/\\(.)/g, "$1")` 将 `\ `、`\(`、`\)`、`\&` 等常见 shell 转义还原。此正则仅对 Unix 路径生效（路径以 `/` 开头），不影响 Windows 路径（`C:\...`）。

备选方案：
- 只处理 `\ `（空格）— 拒绝，shell 转义不限于空格，括号和 `&` 也会在路径中出现
- 在 Ghostty 层面禁用转义 — 拒绝，这需要终端配置变更，不是代码修复

## Risks / Trade-offs

- [Risk] `\\(.)` 过度匹配 — 如果 Unix 路径中真的包含字面量 `\X` 序列，会被误反转义。但 Unix 路径中极少出现反斜杠，且仅对以 `/` 开头的路径生效，风险可忽略

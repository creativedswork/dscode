## 变更综述

从统一工具结果截断逻辑消除双管道不一致，到增强格式化实现代码高亮，再到修复 ToolCard 中 Markdown 组件因继承 CSS 属性导致的渲染错误——本次变更修复了内置工具结果的格式破损（JSON 单行、代码块结构丢失、过量空白）以及 MCP 工具结果缺少 Markdown 渲染的问题。

## 变更时间线

- 2025-07-14: `unify-tool-result-formatting` — 统一两条展示管道的工具结果截断逻辑到单一扼流点 `formatToolResultForUI`
- 2025-07-14: `format-tool-results-in-ui` — 增加内容感知格式化（JSON、代码块），ToolCard 切换为 Markdown 渲染
- 2026-07-15: `toolcard-compact-spacing` — 修复 CSS 层叠层冲突导致的内置工具结果间距过大
- 2026-07-15: `fix-tool-result-rendering` — 修复 ToolCard CSS 继承冲突导致的格式破损，提升截断限制，MCP 原始块启用 Markdown

## 初始设计

工具结果在前端展示存在两条独立的管道（Live 路径和 History 路径），各自实现截断逻辑且不一致。

`unify-tool-result-formatting` 创建了 `src/ui/shared/tool-result-formatter.ts` 作为单一扼流点，`format-tool-results-in-ui` 在此基础上增加了内容感知格式化（JSON pretty-print、bash 代码块包裹）并将 ToolCard 结果体切换为 Markdown 组件渲染。

## 修复记录

### 修复: CSS 层叠层冲突导致间距过大
- **症状**: 内置工具结果 header 与内容之间有 ~19px 间隙，MCP 工具仅 ~2px
- **根因**: `.tool-card-body-inner pre` 样式位于 `@layer components`，被 Tailwind `@layer utilities` 的 `p-3` + `my-1` 覆盖
- **修复**: 移出 `@layer components` 到非层级 CSS；`<pre>` 内联样式迁移为 CSS 类

### 修复: ToolCard 内 Markdown 渲染格式破损
- **症状**: 内置工具结果 JSON 显示为单行、代码块结构丢失、内容周围大块空白；MCP 工具结果落入 raw block 路径后以纯文本显示无 Markdown 渲染
- **根因**: `.tool-card-body-inner` 的 `white-space: pre-wrap`、`font-family: monospace`、`color: muted` 等 CSS 属性被子元素 `<Markdown>` 的 `<pre>` 继承，破坏了代码块渲染；`DEFAULT_MAX_CHARS = 600` 截断 pretty-print 后的 JSON 使其不可读；MCP `mcp-raw-block` 使用 `{tool.result}` 而非 `<Markdown>`
- **修复**: 从 `.tool-card-body-inner` 和 `.mcp-raw-block` 中移除冲突 CSS 属性（保留 padding、border-top、max-height、overflow-y）；MCP raw block 切换为 `<Markdown>` 渲染；`DEFAULT_MAX_CHARS` 从 600 提升至 2000；降低 Markdown `<pre>` margin；提升 `.tool-card-body-inner` `max-height` 至 400px

## 最终状态

`fix-tool-result-rendering` 做了以下修复：
- 从 `.tool-card-body-inner` 移除 `font-family`、`color`、`white-space`、`font-size`、`line-height`，让 Markdown 组件全权控制文本样式
- 从 `.mcp-raw-block` 同理移除冲突属性
- MCP raw block 路径改用 `<Markdown>{tool.result}</Markdown>` 渲染
- `DEFAULT_MAX_CHARS` 从 600 提升至 2000，避免 pretty-print JSON 被中截断
- Markdown 组件 `<pre>` margin 从 `my-2` 缩小，消除 ToolCard 内空白
- `.tool-card-body-inner` `max-height` 从 320px 提升至 400px

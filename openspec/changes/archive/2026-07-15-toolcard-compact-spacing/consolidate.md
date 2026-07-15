## 变更综述

从统一工具结果截断逻辑消除双管道不一致，到增强格式化实现代码高亮和 JSON pretty-print，再到修复 CSS 层叠层冲突导致的视觉间距问题——本次变更聚焦于 ToolCard 组件中内置工具结果的紧凑间距渲染，根因是 `@layer components` 中的样式被 Tailwind 的 `@layer utilities` 覆盖。

## 变更时间线

- 2025-07-14: `unify-tool-result-formatting` — 统一两条展示管道的工具结果截断逻辑到单一扼流点 `formatToolResultForUI`
- 2025-07-14: `format-tool-results-in-ui` — 增加内容感知格式化（JSON、代码块），ToolCard 切换为 Markdown 渲染，定义 `tool-result-content-rendering` capability
- 2026-07-15: `toolcard-compact-spacing` — 修复 CSS 层叠层冲突导致的内置工具结果间距过大问题

## 初始设计

工具结果在前端展示存在两条独立的管道（Live 路径和 History 路径），各自实现截断逻辑且不一致，导致"修一边漏一边"。

`unify-tool-result-formatting` 创建了 `src/ui/shared/tool-result-formatter.ts` 作为单一扼流点，所有工具结果必经此函数，删除了两处各自的临时截断逻辑。

## 变更记录

### 变更: 工具结果智能格式化
- **触发**: 工具结果在 ToolCard 中全部以纯文本渲染，JSON 压缩、Markdown 不解析、bash 无代码块包裹
- **改动**: 增强 `formatToolResultForUI` 增加内容感知格式化；ToolCard 结果体切换为 Markdown 组件渲染；定义 `tool-result-content-rendering` capability
- **影响**: ToolCard 内 `<pre>` 元素开始使用 Tailwind 的 `p-3` 和 `my-1` 工具类，为后续的 CSS 层叠层冲突埋下伏笔

## 修复记录

### 修复: 内置工具结果间距过大
- **症状**: ToolCard 中内置工具（bash、read_file、grep、glob）结果在 header 和内容之间有 ~19px 的视觉间隙，而 MCP 工具仅 ~2px
- **根因**: `index.css` 中 `.tool-card-body-inner pre { padding: 6px 10px; margin: 0 }` 位于 `@layer components`，但 Markdown 的 `<pre>` 使用 Tailwind `p-3` + `my-1`（位于 `@layer utilities`）。CSS 层叠层规范规定 `@layer utilities` 始终优先于 `@layer components`，无论特异性如何——所以组件层的覆盖从未生效
- **修复**: 将 `.tool-card-body-inner pre` 样式移出 `@layer components` 到非层级 CSS（unlayered CSS 优先级高于所有 `@layer` 规则）；将 Markdown `<pre>` 的内联样式迁移为 CSS 类 `md-pre-base` 以允许覆盖；为 `.tool-card-body-inner` 添加 `background: var(--color-bg)`

## 最终状态

`toolcard-compact-spacing` 解决了 CSS 层叠层冲突导致的间距问题：
- 将 `.tool-card-body-inner pre` 和 `.mcp-raw-block pre` 样式移出 `@layer components` 到非层级 CSS
- 将 Markdown 组件 `<pre>` 的内联样式（`border`、`borderRadius`、`backgroundColor`、`color`）迁移为 CSS 类 `md-pre-base`
- 为 `.tool-card-body-inner` 添加 `background: var(--color-bg)` 与 `.mcp-raw-block` 一致
- `md-pre-base` 类在所有非 ToolCard 上下文中保持完全相同的视觉效果

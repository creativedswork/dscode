## Why

工具结果在 ToolCard 中全部以纯文本（`font-mono whitespace-pre-wrap`）渲染。JSON 是一坨压缩字符串，Markdown 不解析，bash 输出没有代码块包裹——用户看到的是一堵灰墙。而同一消息气泡里的 assistant 正文已经通过 `<Markdown>` 组件完整渲染了，ToolCard 落后了。

`unify-tool-result-formatting` 已经把截断逻辑收敛到 `formatToolResultForUI` 这个扼流点，现在是时候在这个基础之上让工具结果**有格式**。

## What Changes

- **增强** `formatToolResultForUI` — 在截断之外，增加内容感知的格式化：JSON 检测 + pretty-print + code fence、bash/read_file 包 code fence
- **修改** `ToolCard.tsx` — 结果体从纯 `<span>` 改为 `<Markdown>` 渲染，去掉 `font-mono` 让 Markdown 控制排版
- **不改** ToolCard 的容器结构、MessageBubble 布局、session 主界面

## Capabilities

### New Capabilities
- `tool-result-content-rendering`: 工具结果按内容类型智能格式化（JSON pretty-print、代码块包裹、Markdown 透传），ToolCard 通过 Markdown 组件渲染结果文本

### Modified Capabilities
- `web-frontend`: ToolCard 的结果渲染方式从纯文本变为 Markdown 渲染

## Impact

- `src/ui/shared/tool-result-formatter.ts` — **修改**，增加 JSON 检测 + 内容感知格式化逻辑
- `web/src/components/ToolCard.tsx` — **修改**，结果体换用 `<Markdown>` 组件
- `tests/ui/tool-result-formatter.test.ts` — **修改**，补充新格式化行为的测试用例

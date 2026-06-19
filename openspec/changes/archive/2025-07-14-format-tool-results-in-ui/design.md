## Context

`formatToolResultForUI`（`src/ui/shared/tool-result-formatter.ts`）是 Live 和 History 两条路径共享的扼流点，当前只做截断（`write_file` 摘要提取 + 默认 600 字符）。前端 `ToolCard` 将 `result` 字符串以纯文本渲染（`font-mono whitespace-pre-wrap`），不做任何格式化。

同时，`MessageBubble` 中的 assistant 正文已通过 `<Markdown>`（基于 `react-markdown` + `remarkGfm`）完整渲染，支持代码块、表格、链接等。ToolCard 应与之一致。

## Goals / Non-Goals

**Goals:**
- 工具结果按内容类型智能格式化：JSON → pretty-print + code fence，bash/grep/read_file → code fence，Markdown → 透传
- ToolCard 通过已有 `<Markdown>` 组件渲染结果，获得代码高亮、表格、链接等能力
- 不引入新前端依赖

**Non-Goals:**
- 不改变 ToolCard 的容器结构（卡片尺寸、边框、圆角、工具名头部）
- 不改变 MessageBubble 布局或 session 主界面结构
- 不改变 agent 看到的原始 tool result（只影响 UI 展示路径）
- 不做语法级别的 JS/TS 高亮（那是语言级的 feature，`react-markdown` + code fence 已足够）

## Decisions

### Decision 1: 格式化逻辑放在扼流点，不在 ToolCard

**Choice:** `formatToolResultForUI` 输出时直接包含 markdown code fence；前端 ToolCard 只负责 `<Markdown>` 渲染。

**Rationale:** 扼流点是所有工具结果到 UI 的必经之路。在这里做格式化，Live 和 History 两条路径自动受益。如果放在 ToolCard（前端），History 路径的 `rebuildDisplayMessages` 输出也要额外处理。

**Alternatives considered:**
- ToolCard 内做检测 + 渲染：逻辑重复，History 路径需单独处理。且前端引入 JSON 检测/pretty-print 会膨胀组件职责。
- 新增后端中间层：过度设计，扼流点本身就是最合适的插入点。

### Decision 2: JSON 检测用 JSON.parse 试探

**Choice:** 检测 `rawText.trim()` 是否以 `{` / `[` 开头，然后 `JSON.parse`。成功则 pretty-print + 包 ```` ```json ````。失败则按其他规则处理。

**Rationale:** 简单的 heuristic 就能覆盖绝大多数情况（grep --json、glob --json、JSON API 响应）。偶尔误判为 JSON 也不产生灾难后果（最多包个空 code fence）。

**Alternatives considered:**
- 正则检测 JSON：不够可靠，JSON 内可以含字符串 `"{"`
- 不做 JSON 检测，所有内容统一包 ```：bash 结果包 ```sh 是对的，但纯 JSON 用 ``` 没有语言标注，语法高亮缺失
- 正则 `/^\s*[\{\[]/` 判断：加 `JSON.parse` 只是多一个 try，成本极低，且能排除"以 { 开头的非 JSON 内容"

### Decision 3: ToolCard 换用 <Markdown> 渲染

**Choice:** 将 ToolCard 结果体从 `<span>→ {displayText}</span>` 改为 `<Markdown className="text-xs">{displayText}</Markdown>`。去掉 `font-mono`，让 Markdown 组件自行控制等宽代码块。

**Rationale:** `<Markdown>` 已在 MessageBubble 中使用，是经过验证的成熟组件。ToolCard 结果体本身就是一个 markdown 内容区域，用同样的渲染方式保持一致性。

**Alternatives considered:**
- 保持纯文本 + 前端 JSON.pretty-print：需要额外引入 `prism` 或 `highlight.js`，增加 bundle size，且与 MessageBubble 的渲染方式不一致
- 只在有 code fence 时用 Markdown，纯文本保持原样：分支逻辑增加了 ToolCard 复杂度，且 `<Markdown>` 对纯文本的渲染也是安全透传

### Decision 4: 工具特定格式化规则

**Choice:** 在 `formatToolResultForUI` 的 `switch` 中按 toolName 分派，最后统一做 JSON 检测兜底。

| 工具 | 格式化规则 |
|------|-----------|
| `write_file` / `overwrite_file` | 保持现有摘要提取（extractWriteSummary） |
| `bash` | 内容包 ```` ```sh ``` ````，保持截断 |
| `grep` | JSON 检测 → pretty-print + ```` ```json ``` ````；非 JSON → ```` ``` ``` ```` |
| `glob` | 同上 |
| `read_file` | 内容包 ```` ``` ``` ````（可后续扩展语言检测），保持截断 |
| 其他 | JSON 检测 → pretty-print + ```` ```json ``` ````；否则保持现有默认截断 |

## Risks / Trade-offs

- **Risk:** JSON.parse 在大字符串上可能耗时。**Mitigation:** grep/glob 的 JSON 输出通常较小（已截断到 600），且 `JSON.parse` 在 V8 中极快。
- **Risk:** `write_file` 摘要中意外包含 markdown 语法字符（如 `_`、`*`）被错误渲染。**Mitigation:** 当前摘要只含 "Written X bytes to path" 和 "New file version: fv_xxx"——不含 markdown 特殊字符。如果后续摘要内容变化，用 escape 处理。
- **Trade-off:** NDJSON（每行一个 JSON 对象）只能取首行。**Mitigation:** 大多数工具结果本身已截断到 600 字符，NDJSON 场景影响极小。
- **Risk:** 某些工具结果本身就包含 ` ``` ` 字符，会破坏 markdown code fence。**Mitigation:** 罕见且当前 600 字符截断已大幅降低概率。可在 code fence 前后加 `\n` 作为天然分隔。

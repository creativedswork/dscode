## Context

当前 web 前端的消息展示基于 "bubbles" 模型：每条消息是一个圆角色块，内部用 `<details>` 包裹 thinking、逐行渲染 Markdown、内嵌 ToolCard。整个消息体是一个 `<div data-collider="message-card">` 的单体容器。

设计原型 `direction-b-flat-minimal.html`（`web/prototypes/`）提供了目标视觉参考。该原型已在 dscode 设计 token（`--color-*`）、字体系统（Geist Sans/Mono）、间距规范下实现。

约束：
- 必须保持 `TransitionCanvas` 碰撞检测兼容（`data-collider` 叶子节点映射不变）
- 必须使用现有 warm-design-system CSS 自定义属性
- 必须保持 `scrollContainerRef` 转发
- 不能引入外部依赖

## Goals / Non-Goals

**Goals:**
- 将 assistant 消息从单一气泡重构为扁平流式容器（thinking / tool cards / text response 分离）
- 重设计 ToolCard 为 6px 圆角扁平卡片，带折叠过渡动画
- MCP 工具结果支持富列表（`.mcp-rich-list`）和原始输出（`.mcp-raw-block`）两种渲染
- user 消息保持气泡样式（仅 visual polish）
- TransitionCanvas data-collider 映射零变化

**Non-Goals:**
- 不改变 Markdown 渲染逻辑（react-markdown pipeline 不变）
- 不改变 TransitionCanvas 的动画逻辑
- 不改变 WebSocket 协议或消息数据模型
- 不引入语法高亮库（后续 change）
- 不引入时间戳真实数据（后续 change）

## Decisions

### D1: Assistant 消息 DOM 结构

```
当前:
<div data-collider="message-card" class="max-w-[85%] px-4 py-3">
  <ThinkingBlock />  <!-- <details> -->
  <Images />
  <div>{lines → <Markdown>}</div>
  <ToolCard[] />
</div>

目标:
<div class="assistant-msg">
  <div class="meta">dscode · 09:41</div>
  <div class="thinking">...</div>
  <div class="tool-card" data-collider="tool-card">...</div>
  <div class="tool-card mcp" data-collider="tool-card">...</div>
  <div class="text-response">...</div>
</div>
```

**Why**: `.assistant-msg` 作为纯布局容器（无 data-collider），TransitionCanvas 会自动跳过它（嵌套排除规则），只取叶子节点做碰撞目标。thinking 区域用 `<div>` + CSS 而非 `<details>`，获得更好的样式控制和过渡动画。

### D2: 不使用 `<details>` 用于 Thinking 区块

当前 ThinkingBlock 使用原生 `<details>` 元素，样式受限且展开/折叠无动画。

**方案**: 用 `<div class="thinking">` + `border-left: 2px solid var(--border)` 实现。hover 时 `border-left-color` 过渡到 `var(--accent)`。thinking 始终可见（不折叠），体现 flat/minimal 的信息不隐藏哲学。

**替代方案已排除**: 
- 自定义折叠动画 — 增加复杂度，flat 设计下 thinking 应该始终可读
- 保留 `<details>` 并加 CSS 动画 — `<details>` 的 `open` 属性不支持过渡

### D3: ToolCard 折叠/展开过渡

**方案**: 用 `max-height: 0 → 300px` 过渡 + `overflow: hidden`，不使用 JS 动画库。header 始终可见，body 用 `transition: max-height 0.3s ease`。

```css
.tool-card-body { max-height: 0; overflow: hidden; transition: max-height 0.3s ease; }
.tool-card.open .tool-card-body { max-height: 500px; }
```

**Why**: 纯 CSS 方案零 JS 开销，0.3s 过渡与设计系统 `transition: background-color 0.3s` 一致。

**风险**: `max-height` 过渡不够精确（内容高度不确定时可能截断或多余空白）。Mitigation: 设 500px 上限覆盖绝大多数情况；MCP 结果区有独立滚动。

### D4: MCP 结果双层渲染策略

MCP 工具结果分两种情况：

| 结果类型 | 渲染模式 | CSS 类 | 实现方式 |
|---------|---------|--------|---------|
| 结构化数据（搜索结果、API 响应） | `.mcp-rich-list` 垂直列表 | 每项含 r-title/r-score/r-url/r-content/r-meta-row | ToolCard 内根据 `tool.mcpResultType` 判断 |
| 原始文本/代码 | `.mcp-raw-block` 等宽滚动区 | 单块 pre-wrap | 默认 fallback |

**判断逻辑**: 如果 `tool.name` 以 `mcp__` 开头，检查结果是否为 JSON 结构。若是 JSON 数组/对象 → rich-list 渲染；否则 → raw-block 渲染。

### D5: data-collider 映射

TransitionCanvas 的 `buildRowList()` 使用 `container.querySelectorAll("[data-collider]")` 查询，并跳过包含子 collider 的父元素（嵌套排除）。映射：

| DOM 元素 | data-collider 值 | 状态 |
|---------|-----------------|------|
| `.user-msg .content`（气泡） | `message-card` | 保持 |
| Markdown 文本行 `<span>` | `text-line` | 保持 |
| Markdown 代码行 `<span>` | `code-line` | 保持 |
| `.tool-card` 容器 | `tool-card` | 保持 |
| `.tool-card-header` | `tool-header` | 保持 |
| 工具结果行 | `tool-result-line` | 保持，扩展到 MCP rich-item/raw-block 行 |
| `.assistant-msg` | 无 | 新（被嵌套排除跳过） |

**结论**: TransitionCanvas 无需任何修改。MCP 结果的新元素只需带上现有的 `tool-result-line` collider。

## Risks / Trade-offs

| Risk | Mitigation |
|------|-----------|
| `max-height` 过渡可能截断长 MCP 结果 | 设 500px 上限；MCP 区域内部有 `overflow-y: auto` |
| Thinking 始终可见增加视觉噪音 | 内容仅 1-2 句摘要，不用长文；字体 13px italic muted color |
| 去掉 `message-card` collider 后 cascade 动画可能漏掉 assistant 整体 | 分析确认 `message-card` 本来就被嵌套排除规则跳过，无影响 |
| MCP rich-list 数量过多时撑开卡片 | 设 `max-height` 限制 + 内部滚动 |

## Open Questions

- 是否需要在 assistant-msg 上加入时间戳实时数据？（当前用静态占位，后续 change 引入）
- MCP 结果 JSON 检测的阈值：多大算"结构化"？（初始版本：`result.trim().startsWith('{')` 或 `startsWith('[')`）
- 是否需要给 MCP 工具卡片 header 添加 server 来源标签（如 `tavily.ai`）？（原型中有，可实现但需要后端提供数据）

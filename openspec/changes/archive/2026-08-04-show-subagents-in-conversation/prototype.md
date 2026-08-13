## Prototype Files

- [`docs/prototypes/archive/2026-08-04-show-subagents-in-conversation/show-subagents-in-conversation.html`](../../../../docs/prototypes/archive/2026-08-04-show-subagents-in-conversation/show-subagents-in-conversation.html)
  — 自包含交互原型，覆盖完整 Web 对话上下文、Agent Activity Card 状态切换、
  Details 折叠、亮暗主题与 TUI 同构预览。

## Visual Direction

Agent Activity 使用对话流内的平面执行卡片，不渲染为 user bubble 或 assistant
response：

```text
EXECUTING

┌ ● General Agent                   Completed · 12s ┐
│ inspect the session switching implementation      │
│ Found two race conditions in the commit path...   │
│ agent-8f31 · background                 [Details] │
└───────────────────────────────────────────────────┘
```

确认的视觉与交互约束：

- Header 同时显示状态图标和文本、Application、attachment 与耗时。
- 原型可交互切换 running、waiting、completed、failed 四种状态；终态错误保留
  独立 error 语义。
- 输入与输出默认展示单行或短段摘要；只有存在更多内容时显示 `Details`。
- `Details` 使用原位折叠，具有 `aria-expanded`、键盘操作和最大高度滚动容器。
- 卡片沿用 ToolCard 的 border、surface、radius、font 与 spacing token。
- 卡片作为独立 collider 参与 Chat-to-Dashboard transition。
- 原型中的 Web/TUI 切换用于比较同一 Activity 数据在双端的呈现；TUI 使用相同
  字段顺序的紧凑文本块，不复刻 Web 的展开交互。

## Prototype Status

HTML 原型已创建，可作为实现与手工验收基线。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/archive/2026-08-04-show-subagents-in-conversation/show-subagents-in-conversation.html` | `archive` | 保留 Agent Activity Card 的四种状态、Details 折叠、Web/TUI 同构和主题切换契约，供后续 SubAgent UI 演进复用。 |

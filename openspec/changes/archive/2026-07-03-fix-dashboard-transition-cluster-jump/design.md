## Context

`TransitionCanvas.strikeRow()` 在处理 `display: inline` 的 `[data-collider]` 元素时，按现有 spec 要求执行 layout freeze（`→ inline-block` + 锁定 height/margin/padding/lineHeight），然后调用 `destroyByType()` 做 DOM mutation，最后以 `getBoundingClientRect()` 重新测量位置并同步 `cluster.y`。

问题：`inline` → `inline-block` 转换后，浏览器布局引擎对 `<span>` 内包 `<div>` 的非法嵌套处理方式不同——inline 态被拆分为匿名块盒，inline-block 态则是完整盒子。`getBoundingClientRect()` 在两态下返回值不一致，导致 recalibration 产生位置跳变。

## Goals / Non-Goals

**Goals:**
- `strikeRow()` recalibration 使用 mutation 前 snapshot 的位置，消除 layout freeze 造成的位置偏移

**Non-Goals:**
- 不修改 `text-line` 的 HTML 结构（`<span>` 包 `<div>` 的非法嵌套）
- 不修改 `buildRowList()` 的过滤逻辑
- 不影响其他 collider 类型（code-line、tool-header 等）的 recalibration 行为

## Decisions

**方案：snapshot-before-mutation**

在 `strikeRow()` 中，于 layout freeze (`display/height/margin` 锁定) 和 DOM mutation 之前，snapshot 当前行的 `top` 值。recalibration 时，对 struck row 自身使用 snapshot 值而非重新测量；对 unstruck rows 仍保持 `getBoundingClientRect()` 重新测量（它们未被 DOM mutation 影响，且可能因 struck row 的 layout freeze 而发生位置偏移）。

```
strikeRow() 现有流程:
  layout freeze → destroyByType() → recalibrate(getBoundingClientRect)

strikeRow() 修复后:
  snapshot top → layout freeze → destroyByType() → recalibrate(snapshot for struck, live for unstruck)
```

**Alternatives considered:**

1. ~~snapshot 全部 rows 的 top~~ — 过度保守，unstruck rows 确实可能因为 struck row 的 layout freeze 而偏移，应反映真实位置
2. ~~clamp `c.y = max(snapshotTop, 0)`~~ — 掩盖问题而非修复根因，且可能造成 cluster 与视觉位置不一致
3. ~~修复 `text-line` 的非法嵌套（`<span>` 改 `<div>`）~~ — 影响面广，涉及 Markdown 渲染和 MessageBubble，属于独立改动

## Risks / Trade-offs

- [Risk] snapshot 值与 layout freeze 后 unstruck rows 的实际位置不一致 → **Mitigation**: unstruck rows 仍用 live `getBoundingClientRect()` 测量，仅 struck row 自身用 snapshot，两者互不干扰
- [Risk] 极少数浏览器对 `getBoundingClientRect()` 返回值在 inline/inline-block 间无差异 → 此修复在该场景下为 no-op，不引入回归

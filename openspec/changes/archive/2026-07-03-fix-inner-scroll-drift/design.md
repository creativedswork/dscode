## Context

`TransitionCanvas.strikeRow()` 在 cascade 阶段撞击 `data-collider` 元素时，会执行 layout freeze（`display` → `inline-block` + 锁定 height/margin/padding/lineHeight）后进行 `destroyByType()` DOM mutation。现有 `fix-dashboard-transition-cluster-jump` 已将 struck row 的 recalibration 改为 snapshot-before-mutation 策略，但只覆盖了行位置测量。

问题：当被撞击元素位于内层 `overflow-y: auto/scroll` 容器中时（ToolCard 的 `max-h-40 overflow-y-auto`、`pre` 的 `overflow-x-auto`），layout freeze + innerHTML 替换会导致浏览器重新计算该内层容器的 `scrollHeight`。尽管单个元素高度被锁定，`inline` → `inline-block` 转换在 `<span>` 包 `<div>` 的非法嵌套结构下改变了浏览器 block-in-inline 拆分的行盒形成方式，使 `scrollTop` 产生累积偏移。多次撞击后（2~3 次），原本被 `max-height` / `overflow: hidden` 裁剪的内容上浮进入可视区。

外层 ChatView 主滚动区已有 `scrollContainerRef` + `overflow: hidden` 锁管理，但内层容器完全不受保护。

## Goals / Non-Goals

**Goals:**
- 在 `strikeRow()` 中 snapshot/restore 被撞击元素所在内层滚动祖先的 `scrollTop`，消除 DOM mutation 导致的累积漂移
- 在 `hideOffscreenColliders()` 中额外通过 `opacity: 0` 隐藏内层滚动容器中被裁剪的行，防止 scrollTop 恢复期间出现短暂闪现
- 最小化改动面，仅修改 `TransitionCanvas.tsx` 内的两个函数

**Non-Goals:**
- 不修改 ToolCard 或 Markdown 的 HTML 结构（`<span>` 包 `<div>` 的非法嵌套）
- 不影响外层 ChatView 主滚动区的现有 lock 逻辑
- 不修改 `buildRowList()` 的过滤逻辑
- 不修改 `destroyByType()` 的 destruction effect

## Decisions

**方案：内层 scrollTop snapshot/restore**

在 `strikeRow()` 中，layout freeze 之后、`destroyByType()` 之前，通过 `findScrollAncestor()` 查找被撞击元素的内层滚动祖先，snapshot 其 `scrollTop`。`destroyByType()` 调用后立即恢复 `scrollTop`，再执行 recalibration。

```
strikeRow() 现有流程:
  snapshot preFreezeTop → layout freeze → compensate transform
  → destroyByType() → recalibrate

strikeRow() 修复后:
  snapshot preFreezeTop → layout freeze → compensate transform
  → snapshot inner scrollTop → destroyByType()
  → restore inner scrollTop → recalibrate
```

**滚动祖先查找复用已有 helper**

`buildRowList()` 中的 `findScrollAncestor()` helper 已在 `strikeRow()` 闭包作用域内可用。查找逻辑相同：沿 parentElement 链向上遍历，首个 `overflow-y: auto|scroll` 元素即为目标。

**hideOffscreenColliders 强化**

现有 `hideOffscreenColliders()` 已通过 `opacity: 0` 隐藏 canvas 视口外的 collider。需扩展：对内层滚动容器中被溢出的 collider（`rect.top < saRect.top || rect.bottom > saRect.bottom`），同样设置 `opacity: 0`。

**Alternatives considered:**

1. ~~在 cleanup 时全局恢复所有内层容器的 scrollTop~~ — 无法在 cleanup 时可靠获取 mutation 前的值；内层容器可能已随 parentCard 的 `opacity: 0` 一起消失
2. ~~在内层容器上设置 `overflow: hidden` 类似外层逻辑~~ — 过度防御，且可能产生视觉跳动（overflow 从 auto → hidden → auto）
3. ~~buildRowList 阶段排除内层容器内不可见的行~~ — 已有 scroll-clip 过滤，不解决 mutation 后的漂移

## Risks / Trade-offs

- [Risk] 极端场景下 `restore scrollTop` 与浏览器自身的 scroll anchoring 行为竞争 → **Mitigation**: 使用 `requestAnimationFrame` 延迟 restore 到下一帧，确保 DOM mutation 的 layout 已完成
- [Risk] 多个内层容器嵌套（如 tool-card > overflow-y-auto > pre > overflow-x-auto）时只处理第一个滚动祖先 → **Mitigation**: 对 `overflow-x` 和 `overflow-y` 分别收集并 snapshot/restore 所有滚动祖先；但实测中 tool-result-line 不存在 x-scroll 祖先关联，仅处理 overflow-y 祖先
- [Risk] `pre` 的 `overflow-x-auto` 可能因 content 宽度变化导致横向漂移 → **Mitigation**: 同时 snapshot/restore `scrollLeft`，但 `code-line` 的 destroy 仅替换 textContent 为 corruption 字符，宽度变化极小，此风险为低优先级

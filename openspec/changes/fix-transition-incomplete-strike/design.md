## Context

当前 `TransitionCanvas`（`web/src/components/TransitionCanvas.tsx`）在 chat → Session Dashboard 过渡时做三段式动画：cascade（cluster 逐行撞击 DOM）→ gather（粒子重组 "DSCode"）→ formed。根因是 cascade 的目标集合被两次「视口裁剪」收窄到当前可视区：

- `buildRowList()` 用 `getBoundingClientRect()` 计算 `top/bottom`，并以 `top >= H || bottom <= 0` 丢弃可视区外元素，且对 `scrollContainer` 再做一次可见矩形裁剪；
- `selectNextCascadeRowIndex()`（`web/src/animation/cascade.ts`）只从 `top < canvasHeight && bottom > 0` 的候选里挑下一个未撞行，撞完可见行即返回 `-1`；
- `launchHop()` 拿到 `-1` 就 `startGather()`，把整个 `scrollContainer` 淡出——视口外已经渲染但从未被撞的内容被一刀清掉。

此外 `cleanupParents()` 把「不在 `s.rows` 里的子 collider」当作已处理，会提前销毁整张父卡。

## Goals / Non-Goals

**Goals:**

- cascade 撞击覆盖**全文所有 `[data-collider]` 行**，而非仅可视区。
- cluster 下探时**自动滚动**聊天容器，让每一行进入视口被撞。
- cluster 落在**实际文字内容**（紧凑文本边界）上，而非行元素盒。
- 撞击更活泼：字符四散、冲击环、震屏、更密的径向粒子。
- 修复 `cleanupParents` 提前淡出。

**Non-Goals:**

- 不改 `markdown-line-colliders` 的 collider 注入方式（`Markdown.tsx` 的 `data-collider` 结构保持不变）。
- 不改 gather/formed 阶段的粒子重组语义（除必要的粒子来源调整）。
- 不改 Session Dashboard 的 artifact 生成、缓存、view-mode 切换。

## Decisions

### D1：行坐标改用「内容坐标」，而非「视口坐标」

`buildRowList()` 用 `top = rect.top - scrollRect.top + scrollTop` 记录每行的内容坐标 Y（`scrollTop=0` 时退化为视口坐标）。cluster 的 `c.y` 也改为内容坐标，绘制时再换算 `vy = c.y - scrollTop`。这样即使自动滚动，行的顺序与间距始终稳定。

- 备选：保持视口坐标、每帧重新测量。→ 被否：滚动中 `getBoundingClientRect()` 持续变化，易出现行跳变/漏撞。

### D2：移除 `buildRowList` 的视口裁剪 + 新增 `autoScroll()`

收集阶段不再 `top >= H || bottom <= 0` 丢弃，也不按 `scrollContainer` 可见矩形裁剪。新增 `autoScroll()`：每帧把 `scrollTop` 向 `clamped(cluster.y - H*0.62)` 平滑逼近，cluster 稳定在视口 62% 高度。`overflow: hidden` 仍保留（锁定用户滚动），程序化 `scrollTop` 不受影响。

- 备选：分页扫掠（撞完一屏滚一屏）。→ 被否：有分页衔接断点，体验不如连续跟随。

### D3：落地用「紧凑文本边界」而非元素盒

新增 `getContentBounds(el)`：`Range.selectNodeContents()` + `getClientRects()` 取字形紧致边界。行增加 `contentTop/Bottom/Left/Right` 与中心点，`landingX/landingY` 落在文本中心。

- 备选：直接落到 `top + height/2`。→ 被否：整行元素盒可能含 padding/占位，视觉上会落在行间距而非文字。

### D4：撞击效果 = 字符四散 + 冲击环 + 震屏 + 径向粒子

撞击点生成：① 冲击环（`rings[]`，accent 描边扩散）；② 屏幕震动（`shake` 叠加后指数衰减）；③ 更密的径向粒子（34–80 颗，按行宽自适应）；④ 文本行拆字符四散（`position: fixed` 悬浮层，每个字符独立 `translate+rotate+scale`）。

- 备选：沿用 clone+overlay 原方案。→ 保留其「不改变布局」的核心，但字符飞散改到屏幕空间悬浮层，避免随滚动容器一起被卷走，也更贴近「撞到字上字被击碎」的诉求。

### D5：`cleanupParents` 不再把视口外子项视为已处理

父卡销毁判定改为「卡内所有子 collider 都在 `s.rows` 中且都已 `struck`」；不在 `s.rows` 的子项应继续等待，而不是默认 `true`。这样只有全文撞完、整卡内容都被处理后父卡才淡出。

## Risks / Trade-offs

- [长消息（数百 collider）导致动画过长 / DOM 字符节点过多] → 对 `textContent.length` 超阈值（> 80 字符）的行退化为粒子爆发而非逐字符四散；粒子总数仍受 `MAX_PARTICLES` 上限约束。
- [自动滚动与内容坐标漂移] → 撞击仅用 `opacity`/`clip-path`/字符飞散（不改布局），内容坐标保持有效；`strikeRow()` 后仍按现有逻辑重新测量并重排 `rows`。
- [自动滚动可能让用户眩晕 / 丢失上下文] → 动画期间锁定用户滚动（`overflow: hidden`），并保持 cluster 稳定在固定视口高度，滚动仅作为被动跟随。
- [全文收集量级] → 只收集叶子 `[data-collider]`（跳过含嵌套 collider 的容器），与现状一致，避免重复计数。

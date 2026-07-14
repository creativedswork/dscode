## Context

Chat→Dashboard 转场动画的 cascade 阶段，集群通过 `strikeRow()` 逐行打击 DOM 元素。当前设计有两个结构性问题：

**1. Collider 覆盖不完整。** ToolCard 的最外层 `<div>` 没有 `data-collider="tool-card"`，可滚动结果区没有 `data-collider="tool-result-line"`，导致 `destroyByType` 中有三个 case 分支（`tool-card`、`message-card`、`tool-result-line`）是死代码。集群在 ToolCard 内只打击 `tool-header`，然后跳过整个结果区跳到卡片下方的 text-line，视觉效果上是"半毁的卡片"。

**2. DOM 变异导致布局漂移。** `destroyTextLine`/`destroyToolHeader` 等函数通过 `el.innerHTML = ""` + 塞入 scatter `<span>` 来制造字符飞散效果。原始内容（Markdown 渲染的 `<div class="prose"><p>...</p></div>`——block 级）被替换为 inline 或 inline-block 的 scatter spans。即使 `strikeRow` 预先锁定了 height/margin/padding/line-height 并在变异后计算 compensateDy/Dx，由于内部渲染模型从 block 切换为 inline，仍然会产生微小的视觉漂移，且相邻行位置需要事后 recalibrate。

另外还有两个次要问题：`launchHop` 的 `candidateTop < 0` 过滤条件比 `buildRowList` 更激进（跳过了部分可见行），`hideOffscreenColliders` 设置 opacity:0 后从不恢复。

## Goals / Non-Goals

**Goals:**
- ToolCard 外层和结果区有正确的 data-collider 覆盖，消除死代码
- 文本类 collider（text-line、tool-header、tool-result-line、code-line、table-cell）的打击不再导致相邻行布局漂移
- `strikeRow` 代码量显著减少（删除 layout freeze + compensate + innerScrollTop snapshot/restore 约 40 行）
- `launchHop` 过滤条件与 `buildRowList` 一致
- 移除无效的 `hideOffscreenColliders`

**Non-Goals:**
- 不使用 Canvas 像素级渲染方案（已明确排除）
- 不修改集群物理（hop-step state machine、squash/stretch/dwell 时序不变）
- 不修改 gather/formed 阶段逻辑
- 不引入新的视觉效果
- 不改变 `spawnParticles` / `spawnImpactFragments`（粒子系统不变）

## Decisions

### Decision 1: Clone+Overlay 替代 DOM 变异

**选择：** 对于 text-line、tool-header、tool-result-line、code-line、table-cell 类型，不再修改原始元素的 innerHTML。改为 clone 内容到 absolute overlay 层，在 clone 上做 scatter/corrupt 动画，原始元素仅设置 `visibility: hidden`。

**原因：** 原始 DOM 结构保持完整，盒模型不受影响。相邻行零漂移。不需要 layout freeze、compensateDy/Dx、innerScrollTop 快照/恢复。

**Clone 放置策略：** clone 放在原始元素内部，position:absolute。原始元素加 position:relative。

```
打击前:
<span data-collider="text-line">           ← el, position:static
  <div class="prose"><p>Hello world</p></div>
</span>

打击后 (动画中):
<span data-collider="text-line" style="position:relative; overflow:visible">
  <div class="prose" style="visibility:hidden">  ← 占位保留
    <p>Hello world</p>
  </div>
  <span style="position:absolute; top:0; left:0; pointer-events:none">  ← clone overlay
    <span style="animation:charScatter...">H</span>
    <span style="animation:charScatter...">e</span>
    ...
  </span>
</span>
```

**替代方案考虑过：**
- Canvas 像素化渲染 → 用户明确排除，实现复杂度高
- 把 scatter spans 放在兄弟 overlay 容器用 getBoundingClientRect 定位 → 需要额外容器管理，不如内部 absolute 简洁
- CSS clip-path/mask 替代 scatter → 视觉效果不如字符飞散

### Decision 2: strikeRow 简化

**选择：** 删除以下逻辑：
- `display: inline` → `inline-block` 切换
- `height` / `marginTop` / `marginBottom` / `paddingTop` / `paddingBottom` / `lineHeight` 锁定
- `compensateDy` / `compensateDx` 计算和应用
- `innerScrollAncestor.scrollTop` snapshot/restore
- recalibrate 中 struck row 使用 preFreeze snapshot 的特殊逻辑

**保留：**
- `destroyByType()` 调用（内部改为 clone+overlay）
- parent card cleanup（`closest('[data-collider="tool-card"], [data-collider="message-card"]')`）
- shake transform（dx, dy），但应用在 clone 上而非原始元素
- recalibrate 中 unstruck rows 的重新测量（防御性，即使理论上不需要）

**原因：** 所有这些逻辑的存在都是为了补偿 DOM 变异导致的布局变化。clone+overlay 不做 DOM 变异，这些补偿不再需要。

### Decision 3: ToolCard collider 铺设

**选择：** 三层 collider 结构：
```
<div data-collider="tool-card">              ← 新增，用于 parent cleanup + clip-path 销毁
  <div data-collider="tool-header">...</div>  ← 已有
  <div class="max-h-40 overflow-y-auto">
    <span data-collider="tool-result-line">   ← 新增，逐行
      <Markdown>line content</Markdown>
    </span>
    ...
  </div>
</div>
```

**tool-result-line 生成方式：** 在 ToolCard 中，将 `displayText` 按 `\n` 分割，逐行包裹 `<span data-collider="tool-result-line"><Markdown>...</Markdown></span>`，空行用 `<br/>`。与 ChatView 中 text-line 的生成模式一致。

**tool-card 销毁时机：** 由现有 parent cleanup 逻辑（`strikeRow` 840-854 行）触发——当 tool-card 内所有子 collider（tool-header + tool-result-line）都被打击后，对 tool-card 执行 `destroyToolCard()`（clip-path circle 收缩 + 粒子爆裂）。无需修改该逻辑，只需确保 `data-collider="tool-card"` 被正确设置。

### Decision 4: launchHop 过滤条件修复

**选择：** 将 `candidateTop < 0` 替换为 `candidateRect.bottom - canvasRect.top <= 0`。

**原因：** `buildRowList` 的过滤条件是 `top >= H || bottom <= 0`（完全在画布外的行才排除）。但 `launchHop` 的过滤多了 `candidateTop < 0`，导致部分在画布上方（top < 0 但 bottom > 0）的行被加入列表但永远不会被打击。修改后两者一致：仅跳过完全在画布外的行。

### Decision 5: 移除 hideOffscreenColliders

**选择：** 删除 `hideOffscreenColliders()` 函数及其调用。

**原因：** 动画期间 scroll 已被锁定（`overflow: hidden`），视口外内容天然不可见。该函数还设置了 `opacity: 0` 但 cleanup 从不恢复，留下隐藏残留。

### Decision 6: 空行跳过打击

**选择：** `text-line` 内容为 `<br/>`（即空行，`textContent === ""`）时，`buildRowList` 中的 `!el.textContent?.trim()` 检查已将其排除。如果因某种原因仍在列表中，`destroyTextLine` 检测到 `chars.length === 0` 时直接 `el.style.opacity = "0"` 并无动画。改为在 `strikeRow` 开始时检测并直接标记 struck + opacity:0，不进入 destroyByType。

## Risks / Trade-offs

- **[风险] clone 渲染保真度** → clone 包含原始 React 渲染的完整 DOM 树（Markdown 的 prose div、p 标签等），scatter 动画前先 `clone.innerHTML = ""` 再塞入字符 span，渲染与当前完全一致。无保真度风险。
- **[风险] tool-result-line 逐行 Markdown 渲染** → 多行代码块被 `\n` 分割后每行独立渲染，代码块可能断裂。但工具结果多为 JSON 或短文本，实际影响小。可后续优化为整体渲染后 DOM 遍历添加 collider。
- **[权衡] clone 对象生命周期** → 每次打击创建一个 clone、一个 `<style>` 元素（keyframes），450ms 后清理。比当前多了一个 clone 节点的创建/销毁，但避免了 layout freeze + recalibrate 的复杂度和 reflow 成本。
- **[风险] 与进行中 change 的冲突** → `fix-dashboard-transition-cluster-jump`（修复 inline→inline-block 跳变）和 `fix-inner-scroll-drift`（修复内层 scroll 漂移）的部分修改与本 change 的简化有重叠。本 change 如果先落地，那两个 change 中对应的 layout freeze 和 scrollTop restore 逻辑可以直接丢弃。

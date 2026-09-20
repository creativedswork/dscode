## Context

`TransitionCanvas` 的 cascade 阶段在透明 canvas 上绘制 "dscode" cluster，同时对 ChatView DOM 里的叶子 `[data-collider]` 行做 hop-step 撞击。当前实现（`fix-transition-incomplete-strike` 的未提交代码）里：

- 行位置用滚动容器内容坐标：`top = rect.top - scrollRect.top + scrollTop`（Y）、`left = rect.left - scrollRect.left`（X）。
- 绘制用 `vy = c.y - scrollTop`。
- 撞击用 `contentCenterX` / `contentCenterY - scrollTop`。

这三个式子只有在「canvas 原点 == 滚动容器原点」且「`scrollContainer` 解析正确」时才自洽。参考原型（同款布局、同款换算）在浏览器里跑通（66 行、撞击逐行发生、坐标对齐）。真实 App 浏览器取证确认 `scrollContainer` 解析成功且 origin 为 `(0, 0)`，剩余问题来自：

1. **长文本块被合并成单一边界**：`Range.getClientRects()` 的全部行被压成一个 `ContentBounds`，cluster 目标落在整段中心，而不是当前经过的可见文字行。
2. **动画从聊天底部开始**：进入 Dashboard 时 `scrollTop` 通常位于尾部，cluster 从全文顶部坐标落下，但视口仍在底部平滑回滚，造成 cluster 穿过眼前内容却没有撞击反馈。
3. **同一元素多行的完成判定缺失**：一个 DOM 元素拆成虚拟行后，父卡片不能以首个匹配行作为整体完成依据。
4. **超时可绕过完整性约束**：固定 6 秒 stall timeout 可能在首个或后续行尚未撞击时直接进入 gather。

origin 偏移和滚动容器解析仍作为坐标安全边界保留，以覆盖 canvas 与滚动容器不共原点的布局。

## Goals / Non-Goals

**Goals:**

- 让 cluster 的**绘制位置**与被撞行的**真实屏幕位置**严格一致（画哪撞哪）。
- 让每条真实渲染文本行独立成为碰撞目标，并在撞击时只消散该行。
- 从全文第一行开始 cascade，自动滚动跟随 cluster，结束时恢复用户原滚动位置。
- 仅在全部虚拟行撞击完成后进入 gather。
- 让 `scrollContainer` 始终解析到真正的聊天滚动容器，绝不退化为 canvas rect + `scrollTop = 0`。

**Non-Goals:**

- 不改 cascade → gather → formed 状态机语义。
- 不改 Markdown / ToolCard 的 `data-collider` 注入方式。
- 不改 dashboard artifact 生成、缓存、view-mode 切换。
- 不重做 gather 粒子重组与 formed 水波动效。

## Decisions

### D1：统一坐标帧 + 显式原点偏移

行位置始终用「滚动容器内容坐标」。所有需要落到 **canvas 空间** 的地方（`drawCluster`、`spawnImpact` 的 ring/粒子、`strikeRow` 传给 `destroyToolCard` 的 `impactX`/`impactY`）都加上显式偏移：

```
originX = scrollRect.left - canvasRect.left
originY = scrollRect.top  - canvasRect.top
drawX  = contentX + originX
drawY  = contentY - scrollTop + originY
impactX = contentCenterX + originX
impactY = contentCenterY - scrollTop + originY
```

这样即使 canvas 覆盖区域比滚动容器大（底部输入区）、或存在顶栏/侧栏偏移，撞击点与绘制点仍重合。

- 备选：保持「假设原点一致」的隐式写法。→ 被否：正是当前 bug 的根源，脆弱且难排查。

### D2：`scrollContainer` 健壮解析

优先用 `scrollContainerRef.current`（`chatContainerRef`）。若为 null，不再走「从 `container.parentElement` 向上找 `overflow-y: auto/scroll`」的 fallback（动画期间 overflow 被改成 hidden，永远找不到），改为从任意一个 `[data-collider]` 元素向上找「classList 含 `overflow-y-auto` 或 computed overflow 可滚动」的最近祖先。

- 备选：捕获后直接 `startGather()` 跳过。→ 被否：让整段动画退化为空转，掩盖问题。

### D3：浏览器取证，不保留临时诊断日志

实现阶段通过浏览器插桩读取 origin、`scrollTop`、Canvas 绘制点和 DOM 样式变化。最终代码不保留临时 `console.*` 诊断；无法解析滚动容器时直接跳过 cascade 进入 gather。

- 备选：永久保留 console 诊断。→ 被否：诊断已完成，且项目约束禁止遗留临时运行路径日志。

### D4：按真实视觉行建立虚拟碰撞目标

对文字类叶子 collider 调用 `Range.getClientRects()`，按 `top` 容差合并同一视觉行的 inline fragment。每个合并结果生成独立 `CascadeRow`；同一个 React DOM 元素允许对应多个 row，不注入或替换文本节点。

- 备选：恢复 Markdown DOM 后处理，为每行包裹 `<span>`。→ 被否：会修改 React-owned text nodes，增加 reconciliation 风险。
- 备选：继续使用整个元素的紧致并集边界。→ 被否：多行段落仍只会在中心产生一次碰撞。

### D5：逐行裁剪并保持盒模型

文字行撞击后，将元素的 `clip-path: inset(topPx 0 0 0)` 从上一次边界推进到当前行底部。这样已撞行消失、后续行仍可见，元素尺寸与后续内容位置不变化。冲击环和粒子使用当前虚拟行中心。

父卡片完成判定收集该容器下的全部 `CascadeRow`，只有所有行 `struck` 后才清理卡片 chrome。

### D6：顶部起步与完整 gather 门禁

初始化时保存 `scrollTop` 并立即设为 `0`，随后构建全文内容坐标；cleanup 恢复原位置。cascade 不使用固定超时跳转，`launchHop()` 只有在找不到未撞行时进入 gather（用户按 Escape 仍可显式跳过）。

### D7：转场期间保持 Markdown DOM 身份稳定

Dashboard artifact 的流式 delta 会持续触发 `App` 重渲染。`Markdown` 原先在每次 render 中创建新的 renderer 函数，导致 ReactMarkdown 重挂载段落节点，使 `CascadeRow` 保存的元素引用脱离文档。renderer 表改为按 `isStreaming` 使用 `React.useMemo`，在内容未变化时保持 DOM 节点身份稳定。

- 备选：每次 strike 重新查询并按文本/序号匹配 DOM。→ 被否：匹配脆弱且会重复执行全文 Range 测量。

### D8：非空 Text node + 嵌套裁剪可见性

文字类 collider 不再对整个元素直接执行 `Range.selectNodeContents()`。改为通过 `TreeWalker` 仅遍历 `textContent.trim()` 非空的 Text node，并对每个 Range rect 逐级检查聊天根滚动容器以内的 `overflow: auto | scroll | hidden | clip` 祖先。可见高度不足 50% 的 fragment 不生成目标。

这样同时排除纯空格、`&nbsp;`、仅由装饰性 inline 元素形成的盒，以及 ToolCard 内层滚动区当前不可见的内容。聊天根滚动容器本身不参与裁剪，因为 cascade 会主动滚动它覆盖全文。

### D9：视觉行按垂直重叠合并

同行判定由单一 `top ±3px` 改为「top 容差或垂直重叠比例达到 60%」。所有文字类 fragment 使用同一个视觉行分组键，因此表格单行、inline code、粗体和链接即使字体盒顶部相差 4-6px，也只生成一个 `CascadeRow`、一次 impact。

### D10：父容器计数与长内容吸入

`buildRowList()` 在 DOM 稳定时为每行记录完整父 collider 链，并建立 `pendingRowsByContainer` 计数。行完成时递减计数，归零后通过 `destroyedContainers` 门禁只销毁一次；不再在动画过程中用 `contains()` 反查归属。代码块和表格外壳补充父 collider 标记。

同一内容 owner 达到 8 条有效视觉行时，前 3 条仍执行原 hop-step 命中。第 3 次命中后进入 480ms `absorbing` 子状态：剩余行一次性完成，owner 围绕撞击核心缩放、旋入并淡出，Canvas 星尘沿带切向速度的向心轨迹汇入核心。吸入结束前不允许 `launchHop()` 或 gather；完成后继续处理后续 owner。

视觉方向来自 Open Design 项目 `dscode-cascade-content-attractor-20260823` 的 `chat-dashboard-transition.html`，保留现有暖灰双主题与琥珀强调色，不增加页面装饰或新依赖。

## Risks / Trade-offs

- [origin 偏移在动画中变化] → 每帧绘制/冲击前重算 origin，不固化初始化值。
- [`scrollContainer` 仍为 null] → 连 collider 祖先都找不到时，`startGather()` 兜底，避免无限空转。
- [Range 为同一行返回多个 inline rect] → 先按 top 容差合并，再生成虚拟行。
- [不同字体盒 top 偏差导致同行重复] → 使用垂直重叠率合并，并对相同几何边界去重。
- [嵌套滚动区隐藏内容形成“撞空气”] → 在采集时按嵌套裁剪祖先求交，仅保留至少 50% 可见高度的 fragment。
- [逐行隐藏导致布局抖动] → 只更新 `clip-path` / `opacity`，不删除节点、不改高度。
- [artifact delta 触发 ChatView 重渲染] → memoize Markdown renderer 类型，避免 React 重挂载 collider 节点。
- [父卡片重复销毁或残留] → 初始化父链计数并用 `destroyedContainers` 保证幂等。
- [长卡吸入与 gather 抢跑] → 独立 `absorbing` hop 子状态持有 480ms，结束后才继续选行。
- [超长会话动画耗时] → 保留 Escape 显式跳过；不以超时破坏“全部撞完才 gather”的默认语义。

## Open Questions

- 无。

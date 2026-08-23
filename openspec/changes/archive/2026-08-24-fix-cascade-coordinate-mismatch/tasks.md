## 1. 坐标帧统一 + 原点偏移

- [x] 1.1 在 `TransitionCanvas` 中新增 origin 偏移计算（`scrollRect` 与 `canvasRect` 的 top/left 差值），并在 `drawCluster` 的绘制坐标上应用 `+ originX / + originY`。
- [x] 1.2 在 `spawnImpact`（冲击环 + 径向粒子）与 `strikeRow` 的 `impactX/impactY` 上应用同一 origin 偏移，确保撞击反馈与被撞行重合。
- [x] 1.3 确认 `buildRowList` / `measureRow` 的行坐标统一为滚动容器内容坐标（Y 加 `scrollTop`、X 相对 `scrollRect.left`），绘制统一 `vy = contentY - scrollTop + originY`、`vx = contentX + originX`。

## 2. scrollContainer 健壮解析

- [x] 2.1 修复 `scrollContainer` 解析：优先 `scrollContainerRef.current`；为 null 时从任意 `[data-collider]` 元素向上找「classList 含 `overflow-y-auto` 或 computed overflow 可滚动」的最近祖先，禁止退化为 `canvas.getBoundingClientRect()` + `scrollTop = 0`。
- [x] 2.2 若 `scrollContainer` 仍不可解析，`startGather()` 兜底，避免空转或猜测坐标。

## 3. 运行时取证与日志清理

- [x] 3.1 通过浏览器插桩采集 origin 偏移、`scrollTop`、Canvas 绘制与 DOM 消散证据，确认 origin 已对齐而长文本块仍未逐行碰撞。
- [x] 3.2 清理临时 `console.*` 诊断，不在最终实现保留运行路径日志。

## 4. 测试与验证

- [x] 4.1 更新 `tests/ui/transition-collider.test.ts`，补充坐标对齐相关 source-level 断言。
- [x] 4.2 `npm run typecheck` 通过。
- [x] 4.3 浏览器对照 `docs/prototypes/archive/2026-08-24-fix-cascade-coordinate-mismatch/fix-cascade-coordinate-mismatch-full-content-cascade.html` 验证：cluster 落点 == 被撞行、撞击逐行发生、全部撞完才 gather、亮暗主题正常。

## 5. 真实视觉行碰撞

- [x] 5.1 使用 `Range.getClientRects()` 将文字类 collider 拆为逐视觉行 `CascadeRow`，并合并同一行的 inline fragments。
- [x] 5.2 同一 DOM 元素按行递增 `clip-path`，只隐藏已撞行且不改变盒模型。
- [x] 5.3 父卡片清理检查其全部虚拟子行，不能以首个匹配 row 作为完成依据。
- [x] 5.4 memoize Markdown renderer 表，避免 artifact 流式更新重挂载 collider DOM 并使动画引用失效。

## 6. 起点与完整性

- [x] 6.1 保存原始 `scrollTop` 后立即归零，从全文第一行启动 cascade，并在 cleanup 恢复。
- [x] 6.2 移除 cascade stall timeout；正常路径仅在全部 row 均 struck 后进入 gather。
- [x] 6.3 补充视觉行合并、逐行裁剪、滚动归零与 gather 完整性的定向测试。

## 7. 空行、同行去重与容器收束

- [x] 7.1 仅从非空 Text node 采集 Range，并过滤嵌套滚动区中不可见的 fragment。
- [x] 7.2 使用垂直重叠率合并同一视觉行，保证一行最多产生一次 impact。
- [x] 7.3 初始化父 collider 链和待完成计数，内容完成后只销毁一次关联外壳。
- [x] 7.4 为 Markdown 代码块和表格补充父容器 collider，避免内容消失后边框残留。
- [x] 7.5 对至少 8 行的内容 owner 实现 3 次直接撞击后的 480ms 向心吸入。
- [x] 7.6 补充空行、同行合并、长内容阈值、父容器计数与吸入门禁测试。
- [x] 7.7 完成 TypeScript、定向测试、完整构建与亮暗主题浏览器验收。

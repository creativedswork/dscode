## Why

chat → Session Dashboard 的转场动画里，"dscode" cluster 的**绘制坐标系**和它**实际撞击行的坐标系**没有对齐：cluster 画在 A 点，撞的却是 B 行。用户看到的是 cluster 逐行跳，但视觉落点上的内容纹丝不动、落点整体偏移，与参考原型严重不符。运行时取证进一步确认：origin 补偿已正确生效，但真实 Markdown 长段落仍被合并成一个大碰撞盒，落点位于整段中心；同时转场从聊天底部开始，cluster 会先穿过眼前内容而不触发逐行消散。

## What Changes

- **统一坐标帧（核心修复）**：行位置统一用滚动容器内容坐标记录；`drawCluster` / `spawnImpact` / `strikeRow` 在 canvas 空间绘制/定位时，显式补偿 canvas 原点与滚动容器原点之间的偏移，保证「画在哪就撞在哪」。
- **按视觉行碰撞**：使用 `Range.getClientRects()` 将一个 Markdown 文本块拆成真实渲染行；同一 DOM 元素可对应多个虚拟行，撞击后通过递增 `clip-path` 只消散当前行。
- **跳过视觉空行**：仅从包含非空文本的 Text node 采集 Range，并排除嵌套滚动区中被裁切的 fragment，避免 cluster 撞击视觉空白。
- **同行只撞一次**：使用垂直重叠率合并 inline fragment 和同屏文本 collider，避免字体盒 top 偏差造成同一视觉行重复命中。
- **统一动画起点**：保存原 `scrollTop` 后立即滚到全文顶部，动画结束时恢复原位置；自动滚动从第一行开始跟随 cluster。
- **完整性门禁**：初始化时记录视觉行的父 collider 链与待完成计数；父框/卡片在计数归零时只清理一次，且未完成内容不能提前进入 gather。
- **长内容吸入收束**：同一内容容器达到 8 条有效视觉行时，仅直接撞击 3 次，随后剩余内容和外壳向 cluster 核心旋入、碎裂并消失，避免超长会话逐行等待。
- **健壮滚动容器解析**：`scrollContainer` 必须解析到真正的聊天滚动容器；解析失败时不再退化为 `canvas.getBoundingClientRect()` + `scrollTop=0`，而是从 collider 元素的真实滚动祖先推导。
- **运行时取证**：通过浏览器测试页采集 origin、scrollTop、行裁剪、吸入和容器清理状态，不在产品运行路径保留诊断输出。
- **清理遗留诊断日志**：移除上一轮 `fix-transition-incomplete-strike` 残留的临时 `console.log("[dscode] …")`。
- **保留参考原型**：`docs/prototypes/archive/2026-08-24-fix-cascade-coordinate-mismatch/fix-cascade-coordinate-mismatch-full-content-cascade.html` 作为归档后的可执行验收标准。

## Capabilities

### New Capabilities

（无新增 capability）

### Modified Capabilities

- `chat-dashboard-transition`: 撞击与绘制坐标帧统一，cluster 必须落在被撞行的真实屏幕位置；`scrollContainer` 解析健壮化。

## Impact

- **Web 前端**：`web/src/components/TransitionCanvas.tsx` —— 坐标换算统一 + 原点偏移补偿 + 视觉行拆分/裁剪 + `scrollContainer` 解析修复。
- **Markdown 稳定性**：`web/src/components/Markdown.tsx` —— 固定 renderer 组件身份，避免 artifact 流式更新重挂载 collider DOM。
- **动画逻辑**：`web/src/animation/cascade.ts`、`web/src/animation/types.ts` —— 视觉行 rect 合并、全文选行与内容边界类型。
- **卡片标记**：`web/src/components/Markdown.tsx` —— 为代码块和表格补充父容器 collider，使内容完成后外壳同步消失。
- **测试**：`tests/ui/transition-collider.test.ts` —— 补充坐标对齐相关的 source-level 断言。
- **原型**：`docs/prototypes/archive/2026-08-24-fix-cascade-coordinate-mismatch/fix-cascade-coordinate-mismatch-full-content-cascade.html` —— 已生成并经浏览器冒烟验证，作为验收标准。

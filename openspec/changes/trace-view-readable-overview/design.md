## Context

WebUI Session Dashboard 内嵌的 Trace widget（`web/src/utils/traceWidget.ts` + `src/ui/shared/trace-tree.ts`）以 git 分支拓扑渲染 Trace 轨迹树。当前有两个可读性问题：

1. `fitView()` 把整棵树等比缩进视口（`k = min(w/bw, h/bh) * 0.92`），节点多时（几百个）每个节点缩到几像素，标签不可读。
2. `assignLanes()` 对每个 Agent 节点 `lane++` 递增分配且从不回收，N 个 SubAgent 产生 N+1 条 lane，横向越铺越宽。

本设计参考 git 工具（gitk / tig / GitKraken / lazygit）的大图导航策略，纠正这两个问题，并让 widget 适配内容宽度。

## Goals / Non-Goals

**Goals:**
- 默认以「固定可读节点尺寸 + 纵向滚动」呈现，节点高度恒定 ~22px，不再把整棵树缩到不可读。
- 提供 minimap 总览（整棵树缩略图 + 视口框 + 点击跳转）。
- 支持自动折叠线性长链（`⋯N`，gitk 式），点击展开。
- 后端 lane 分配改为 fork 分配 / merge 回收，横向 lane 数 = 最大嵌套深度。
- widget 容器宽度适配内容（`fit-content`），不再铺满整个 UI 宽。
- 保留既有交互与大树性能保护。

**Non-Goals:**
- 不引入第三方图可视化/虚拟滚动库（保持零依赖）。
- 不改 `ViewMode` / `ViewModeSelector` / `MessageInput`，不触发报告重生成。
- 不做 force-directed 拖拽重排、Trace 回放或导出。
- 不做跨 Session 聚合 Trace。

## Decisions

### D1 — 可读默认视图替代 fit view
默认视图改为固定节点尺寸（~22px 高、~30px 行距）+ 纵向滚动；`fit view` 降级为 toolbar 按钮。缩放改为 Ctrl+滚轮 / 工具栏 `±`，以光标或视口中心为锚。选择理由：gitk/lazygit 从不把节点缩到不可读，而是固定高度滚动；fit-to-tiny 是当前「内容非常小」的直接根因。备选（保留 fit 默认 + 提高最小缩放阈值）治标不治本，长树仍不可读。

### D2 — minimap 总览
右侧新增 minimap（约 150px 高），以极简形式渲染整棵树的 lane + 节点点 + 边，叠加视口框（当前可视区域），点击 minimap 跳转。视口框按 `scrollLeft/scrollTop` 与 `zoom` 映射到 minimap 坐标。选择理由：GitKraken/代码编辑器 minimap 是大图导航的成熟范式，解决「我在整棵树哪里」。备选（顶部滚动条缩略条）信息量不足。

### D3 — 线性长链自动折叠
「无聊节点」= 非 agent、无 merge、恰一个非 agent 子节点的单链节点。识别最大线性 run（长 ≥3），折叠中间节点为 `⋯N`，保留 run 首尾节点，点击 `⋯N` 展开该 run。默认开启，与既有的手动折叠 SubAgent 子树正交。选择理由：一次对话的 Main 脊柱由大量 `user→assistant→tool→assistant` 单链组成，折叠后纵向高度可降数倍（原型 215 节点 → 46 可见行）。备选（仅手动折叠）对长脊柱无效。

### D4 — lane 复用（后端投影）
`assignLanes` 改为 DFS 时 fork 分配空闲 lane、子树结束（merge 点）后回收。lane 分配与 DFS 布局顺序一致（continuation-first），子树为连续块，因此回收是安全的。选择理由：横向宽度从「Agent 总数」降到「最大嵌套深度」，原型 7 Agent → 3 lane。备选（渲染端动态重排 lane）需要重写布局，且 lane 属于投影语义，放后端更内聚。

### D5 — 内容自适应宽度
`.trace-widget` 改为 `width: fit-content; max-width: 100%`；`.canvas-wrap` 宽度由 JS 设为 `min(内容自然宽 × zoom, 可用宽)`，超出可用宽才出现横向滚动；minimap/详情面板作为内容宽度的一部分。选择理由：窄树（lane 复用后 3 lane ≈ 600px）不应铺满 1600px 视口。备选（minimap 悬浮 overlay）更窄但遮挡内容，暂取内嵌，留 Open Question。

### D6 — 交互保留
滚轮纵向滚动、Ctrl+滚轮缩放、节点点击详情、日期/Agent 过滤、全屏、亮暗主题、大树深度折叠全部保留。focus/dim（点击聚焦子树）与 minimap 无冲突。

## Risks / Trade-offs

- [minimap 增加一处分身渲染，每帧重绘成本] → minimap 用极简元素（无标签、细边、小点），且仅在 readable 模式渲染；大树性能保护沿用深度折叠。
- [折叠后 run 首尾节点语义变弱（`⋯N` 抽象掉中间）] → 点击 `⋯N` 可展开；merge 目标节点（spawn 的 continuation）始终是 run 首节点，不会被折叠掉，虚线合并边不断裂。
- [lane 复用改变现有 lane 颜色/归属视觉] → lane 颜色按「当前活跃 lane 索引」着色，Agent 归属仍以 `ownerAgentId` 承载（详情/筛选不受影响）。
- [内容自适应宽度在窄屏下可能太窄/横向滚动] → `max-width` 封顶 + 可用宽下限，横向滚动仅在树真实超宽时出现。
- [`assignLanes` 是后端投影，改动影响面超出纯渲染] → 该函数单一职责、纯函数、无副作用，改动局部且有单测覆盖。

## Open Questions

- minimap 放右侧内嵌（计入内容宽）还是悬浮 overlay（不计入内容宽）？暂定内嵌。
- 线性折叠阈值：run 长度 ≥3 即折，还是设更高阈值（如 ≥5）？暂定 ≥3。
- `fit view` 是否保留为按钮，还是彻底移除？暂定保留为次要按钮。

## Prototype Files

- `docs/prototypes/trace-tree-view-readable-overview.html` — 自包含单文件交互原型，展示 Trace 轨迹树的大图可读导航与内容自适应宽度：默认「可读 + 总览」模式（固定 ~22px 节点高 + 纵向滚动 + Ctrl/工具栏缩放），右侧 minimap 总览（整树缩略图 + 视口框 + 点击跳转），自动折叠线性长链（`⋯N`，点击展开），lane 复用（fork 分配 / merge 回收，7 个 agent → 3 条 lane），以及 `fit-content` 内容宽度适配（卡片收缩到内容宽、封顶可用宽）。合成 215 节点（30 轮 Main + 5 SubAgent + 1 嵌套），可切换「适配视图（现状）」对比缩放过小问题；支持亮/暗主题、紧凑/宽松密度、折叠开关、缩放、minimap 点击跳转、节点详情。视觉对齐 `--color-*` warm design system tokens + git 多色 lane。

关键视觉与交互决策（经原型确认）：
- 默认「可读 + 总览」：节点固定尺寸 + 滚动，fit view 降级为对比按钮，杜绝「整棵树缩到几像素」。
- minimap 右侧内嵌（计入内容宽）：整树缩略图 + accent 描边视口框，点击跳转，随滚动/缩放实时同步。
- 线性长链折叠默认开启：连续单链 run（长 ≥3）折叠中间节点为 `⋯N`，run 首尾节点保留；merge 目标（spawn continuation）始终为 run 首节点，虚线合并边不断裂。
- lane 复用：DFS 时 fork 分配空闲 lane、子树结束回收，横向 lane = 最大嵌套深度（原型 7 agent → 3 lane），Agent 归属仍靠 `ownerAgentId`。
- 内容自适应宽度：`.trace-widget` = `fit-content` 卡片 + `max-width` 封顶；画布宽 = `min(内容自然宽 × zoom, 可用宽)`，窄树不再铺满 UI 宽。
- 折叠后 215 节点 → 46 可见行，纵向高度降 ~4.7×。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/trace-tree-view-readable-overview.html` | `archive` | 编码了 git 工具式大图导航的视觉契约（可读固定节点 + minimap + 线性折叠 + lane 复用），并提供「可读 vs 适配视图（现状）」的可执行方案对比与亮/暗、密度、折叠多状态矩阵，代码/测试/Spec 无法等价表达；与最终实现及当前 `--color-*` tokens 一致，未被子版本取代，可归因于本 change |

## Prototype Status

（UI 变更，不适用 stub）

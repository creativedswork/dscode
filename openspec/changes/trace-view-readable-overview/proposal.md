## Why

Trace widget 当前把整棵树「适配视图」等比缩放塞进视口，节点一多就全部缩到几像素、不可读；同时后端 `assignLanes` 对每个 Agent 递增分配 lane 且从不回收，多 SubAgent 时横向铺得过宽。本次变更参考 git 工具（gitk / GitKraken / lazygit）的大图导航策略，让 Trace 在大型 Session 下仍可读、可导航，并让 widget 适配内容宽度而非铺满整个 UI 宽。

## What Changes

- 默认视图从「fit 缩放整棵树」改为「固定可读节点尺寸 + 纵向滚动」，节点高度恒定 ~22px；fit view 降级为手动按钮，缩放改为 Ctrl+滚轮 / 工具栏。
- 新增右侧 minimap 总览：整棵树缩略图 + 视口框 + 点击跳转。
- 折叠能力从「手动折叠 SubAgent 子树」扩展为「自动折叠线性长链」（`⋯N`，gitk 式），点击 `⋯N` 展开。
- 后端 `assignLanes` 从「递增不回收」改为 fork 分配 / merge 回收，横向 lane 数 = 最大嵌套深度而非 Agent 总数。
- widget 容器宽度适配内容（`fit-content`，封顶可用宽），不再铺满 UI 宽；minimap 作为内容宽度的一部分。
- 保留既有交互：节点详情、日期/Agent 过滤、折叠、全屏、亮暗主题、大树性能保护。

## Capabilities

### New Capabilities

- `trace-view-readable-overview`: 定义 Trace 轨迹树在大型 Session 下的可读导航与内容自适应宽度——固定可读节点尺寸 + 滚动、minimap 总览、线性长链折叠、lane 复用，以及 widget 内容宽度适配。

### Modified Capabilities

（无 — 本次为 `trace-tree-view` 的后续能力新增；`trace-tree-view` 尚未归档进 `openspec/specs/`，`session-dashboard` 的既有 requirement 不变。）

## Impact

- 渲染：`web/src/utils/traceWidget.ts` 的 `fitView` 默认行为、`.trace-widget` / `.canvas-wrap` 容器宽度 CSS、新增 minimap 渲染与视口框、线性长链折叠逻辑。
- 投影：`src/ui/shared/trace-tree.ts` 的 `assignLanes` 改为 fork 分配 / merge 回收（lane 复用）。
- 测试：lane 复用、线性折叠、minimap 映射、内容宽度适配相关单测 + 渲染覆盖。
- UI 依据：`docs/prototypes/trace-tree-view-readable-overview.html`（explore 阶段生成并确认）。
- 不新增第三方依赖；不改 `ViewMode` / `ViewModeSelector` / `MessageInput`。

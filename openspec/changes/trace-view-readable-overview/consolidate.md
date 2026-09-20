## 变更综述

本 change 在既有 `trace-tree-view`（git 分支拓扑 Trace 轨迹树，尚未归档）基础上，针对大型 Session 下 Trace widget 的两个可读性问题——「整棵树等比缩进视口导致节点不可读」与「lane 递增不回收导致横向过宽」——引入 git 工具式的大图导航（固定可读节点尺寸 + 滚动、minimap 总览、线性长链折叠、lane 复用），并让 widget 适配内容宽度而非铺满整个 UI 宽。

## 变更时间线

- 2026-08-14: `trace-view-readable-overview` — Trace widget 可读导航 + 内容自适应宽度

## 初始设计

最初想解决的问题：Trace widget 当前把整棵树「适配视图」等比缩放塞进视口，节点多时全部缩到几像素不可读；后端 `assignLanes` 对每个 Agent 递增分配 lane 且从不回收，多 SubAgent 时横向铺得过宽。

设计思路：参考 gitk / GitKraken / lazygit 的大图导航策略，默认以固定可读节点尺寸 + 纵向滚动呈现，右侧 minimap 提供整树总览与视口框，自动折叠线性长链（`⋯N`），后端 lane 分配改为 fork 分配 / merge 回收；widget 容器宽度适配内容（`fit-content`）。

## 变更记录

### 变更: 可读默认视图替代 fit view
- **触发**: 用户反馈「所有 trace 呈现出来，view 内 trace 内容非常小」。
- **改动**: 默认视图从 fit 缩放改为固定节点尺寸 + 滚动，fit view 降级为手动按钮。
- **影响**: `web/src/utils/traceWidget.ts` 渲染与交互逻辑。

### 变更: 内容自适应宽度
- **触发**: 用户反馈「trace view 能不能适配内容，别沾满整个 UI 宽」。
- **改动**: widget 容器改为 `fit-content`，画布宽 = `min(内容自然宽 × zoom, 可用宽)`。
- **影响**: `.trace-widget` / `.canvas-wrap` CSS 与渲染尺寸计算。

## 修复记录

（无）

## 最终状态

本 change 的完整 proposal 见 `proposal.md`：新增能力 `trace-view-readable-overview`，定义固定可读节点尺寸 + 滚动、minimap 总览、线性长链折叠、lane 复用、内容自适应宽度五类 requirement，并保留既有的节点详情、日期/Agent 过滤、折叠、全屏、亮暗主题与大树性能保护。UI 依据为 `docs/prototypes/trace-tree-view-readable-overview.html`。

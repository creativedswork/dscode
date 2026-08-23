## Context

Session Dashboard 的 Trace 视图当前实现（来自未归档的 `trace-tree-view` 与 `trace-view-readable-overview`）是一个注入 dashboard iframe 的自包含 SVG widget，渲染「git 分支拓扑」：每个 Agent 一条纵向 lane，SubAgent 从 `spawn_agent` 向右分叉、结束以虚线 `mergeTargetId` 并回，lane 采用 free/alloc/release 回收，并带 gitk `⋯N` 线性折叠与 minimap/缩放/日期/Agent 过滤。用户诉求是「做成 VSCode Git Graph 的多 lane 分叉**样子**」，而非字面实现 git 分支语义。

两个交互缺陷：
1. `focusSubtree` 点击聚焦把选中节点子树之外的所有节点压到 22% 透明度（用户感知为「整棵树丢了」）。
2. `selection` 单向粘住，无任何清除/返回入口（点 `main` 也回不去）。

本设计把渲染收束为**轨迹树**：节点 + 父→子细曲线边为主体，根为 Main Agent，多 lane 分叉/并回仅作为拓扑结构；同时修正交互。

## Goals / Non-Goals

**Goals:**

- 轨迹树渲染：节点按 kind 形状区分（agent=菱形、user=空心圆、assistant=实心点、tool=方块），边为父→子的细曲线 elbow，SubAgent 分叉/并回，Main Agent 为根。
- 路径高亮交互：点击高亮「选中节点 + 祖先 + 后代」，其余节点全正常显示（不降透明度）。
- 清除选择：`Esc` / 点击空白 / 再次点击 / 工具栏 ✕ / 详情 ✕。
- 投影简化：移除 `mergeTargetId`、lane 回收、线性折叠、日期/Agent 过滤。

**Non-Goals:**

- 不引入 pan/zoom、minimap、全屏。
- 不保留日期过滤、按 Agent 筛选。
- 不保留 gitk `⋯N` 线性折叠与虚线 merge 语义。
- 不改 `ViewMode`、`MessageInput`、LLM 报告生成流程。

## Decisions

1. **数据模型**：保留 `TraceNode` 树与 `parentId`，**删除 `mergeTargetId`**（并回改为纯视觉，不再作为数据关系）。保留 `ownerAgentId`（详情面板归属展示用），`lane` 改为渲染期由分支顺序推导的稳定索引。
2. **lane 分配**：main=0，每个 `spawn_agent` fork 分配一个**新** lane（顺序递增，嵌套继续递增），**不回收**。理由：无回收算法最简单、分支归属一目了然；代价是 lane 数 = fork 总数，横向可能变宽——由横向滚动吸收，典型 Session 的 SubAgent 数量有限。若未来深嵌套场景过宽，再把回收作为纯渲染优化重新引入。
3. **渲染**：沿用「SVG 覆盖 + HTML commit 行」结构（保持与现有 widget 注入方式一致）。SVG 只画**树边**与**节点标记**：边为父节点底部→子节点顶部的细 cubic-bezier（同 lane 为竖线，跨 lane 为曲线 elbow），fork 用子分支色、return 用 muted 灰色实线（非虚线）。节点标记加 `--color-surface` halo 底衬压在边上，Main Agent 加根环。commit 行仅承载 label/agent chip/摘要/时间/状态点。
4. **交互**：`selection` 存节点 id。渲染期计算 `pathSet = ancestors(parentId 链) ∪ descendants(children 递归) ∪ {selected}`。样式只作用于 HTML 行（selected=accent-bg+inset bar，path=5% accent tint），**不做任何 opacity 降级**。清除选择置 `selection = null` 并重渲染。
5. **投影简化**：删除 `computeTraceRuns`/`applyTraceFolds`（线性折叠）、`filterTraceTreeByDate`/`filterTraceTreeByAgent`/`applyTraceFilters`（过滤）、`listTraceAgents`（无 Agent 筛选后不再需要）。保留 `projectTraceTree`、链式嵌套、tool 单节点、SubAgent 分叉与 transcript 加载、`synthesizeFallbackMessages` 退化。
6. **工具栏收敛**：仅保留主题切换与清除选择；移除日期过滤、Agent 筛选、缩放、fit、minimap、全屏、折叠开关。

## Risks / Trade-offs

- [移除 fullscreen/minimap/zoom] → 大树只能靠原生滚动。→ 默认可读布局 + 纵向滚动足够；若确有需要，作为后续独立变更重新引入。
- [不回收 lane] → 多 SubAgent 时横向变宽。→ 横向滚动吸收；典型场景可接受。
- [路径高亮在深链上近似整树] → 单链时「祖先+后代」约等于全树。→ 路径高亮用 5% 极淡 tint，强信号只留给选中节点本身。
- [BREAKING 移除日期/Agent 过滤] → 依赖这些筛选的用户功能丢失。→ 已在 proposal 标注 BREAKING；这些筛选（尤其 Agent 下拉的 `main` 项）正是「回退不了」的混淆来源之一。
- [纯客户端 widget 重写] → 需保持 iframe sandbox `allow-scripts` 与主题 token 注入不回归。→ 沿用 `prepareSessionDashboardHtml` / `applyArtifactTheme` 注入链路。

## Migration Plan

- 无数据迁移：纯投影 + 渲染重写，局限在两个源文件与单测。
- 回滚：还原 `src/ui/shared/trace-tree.ts`、`web/src/utils/traceWidget.ts`、`tests/ui/trace-tree.test.ts`。

## Open Questions

- 是否需要以独立后续变更恢复 fullscreen 或 zoom（当前明确不纳入）。

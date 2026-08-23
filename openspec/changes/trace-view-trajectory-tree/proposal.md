## Why

Session Dashboard 的 Trace 视图有两个交互缺陷：点击节点会通过「聚焦子树」把整棵树其余部分压到低透明度（用户感知为「整棵树丢了」），且没有任何清除选择/返回入口（点了就回不去）。同时，上一版把「做成 VSCode Git Graph 的样子」字面实现成了一套 git 分支语义（`mergeTargetId` 虚线合并、lane 回收/分配、gitk `⋯N` 线性折叠、「Agent lanes · git branches」文案），用户从未要求这些。本变更把它收束为一个**轨迹树（trajectory tree）**：保留多 lane 分叉的 Git Graph 视觉，但以「节点 + 父→子细边」为主体，根为 Main Agent，并修正交互。

## What Changes

- **交互修复**：点击节点改为「高亮选中节点 + 祖先/后代路径，其余节点全正常显示」，不再降低透明度（替换旧「点击聚焦子树」行为）。
- **交互新增**：提供明确的清除选择入口（`Esc` / 点击空白 / 再次点击已选节点 / 工具栏 ✕ / 详情面板 ✕）。
- **渲染重设计**：从「git 分支 lane + commit 圆点」改为「轨迹树」——节点按 kind 用形状区分（agent=菱形、user=空心圆、assistant=实心点、tool=方块），边为父→子的细曲线 elbow，SubAgent 从 `spawn_agent` 点向右分出新 lane、结束以实线并回主 lane，Main Agent 为明确根（带根标记）。
- **移除字面 git 语义**：删除 `mergeTargetId` 虚线合并、lane 回收/分配算法、gitk `⋯N` 线性折叠、「Agent lanes · git branches」文案。
- **简化工具栏（BREAKING）**：移除日期过滤、按 Agent 筛选、缩放/平移、minimap、全屏开关——与已确认的轨迹树原型保持一致。
- **投影简化**：移除 merge 关系与 lane 回收，保留 SubAgent 分叉结构、SubAgent transcript 加载、tool 单节点语义与链式嵌套。

## Capabilities

### New Capabilities

- `trace-view-trajectory-tree`: 轨迹树投影、渲染与交互。以 Main Agent 为根的树式拓扑、节点 kind 形状区分、多 lane 分叉/并回、路径高亮交互与清除选择。取代未归档的 `trace-tree-view` 与 `trace-view-readable-overview` 中 git 分支可视化的投影与渲染语义。

### Modified Capabilities

- `session-dashboard`: Trace widget 的内嵌语义从「git 分支可视化、可全屏展开」改为「轨迹树、只读内嵌」；移除全屏展开要求。

## Impact

- **投影逻辑**：`src/ui/shared/trace-tree.ts`——移除 `mergeTargetId`、lane 回收；保留 Agent 根投影、链式嵌套、tool 单节点、SubAgent 分叉与 transcript 加载。
- **Web 前端**：`web/src/utils/traceWidget.ts`——重写渲染（节点+边树式 SVG）、路径高亮交互、清除选择、移除日期/Agent 过滤、缩放、minimap、全屏、折叠。
- **测试**：`tests/ui/trace-tree.test.ts`——更新投影单测（移除 merge/lane 回收断言），新增交互与渲染断言。
- **视觉依据**：`docs/prototypes/trace-view-trajectory-tree.html`（explore 阶段生成并确认）。
- **取代关系**：本变更取代未归档的 `trace-tree-view` 与 `trace-view-readable-overview` 变更（它们仍在 `openspec/changes/`，未归档进 `openspec/specs/`）。

## Prototype Files

- `docs/prototypes/trace-view-trajectory-tree.html` — 自包含单文件交互原型，展示轨迹树（trajectory tree）视觉：保留 VSCode Git Graph 的多 lane 分叉感，但以「节点 + 父→子细曲线边」为主体，Main Agent 为根（带根环）。节点按 kind 形状区分（agent=菱形、user=空心圆、assistant=实心点、tool=方块），SubAgent 从 `spawn_agent` 点向右分出新 lane（teal/blue），结束以 muted 实线并回主 lane。点击节点只高亮选中 + 祖先/后代路径（其余全正常、无透明度压暗）；`Esc`/点击空白/再次点击/工具栏 ✕/详情 ✕ 均可清除选择。支持亮/暗主题与节点状态（done/running/failed/waiting）切换。

关键视觉与交互决策（经原型确认）：
- 多 lane 分叉：Main=琥珀、SubAgent=teal/blue，每个 fork 一条新 lane，无 lane 回收。
- 边为父→子的细 cubic-bezier（同 lane 竖线、跨 lane 曲线 elbow），fork 用子分支色、return 用 muted 灰色实线（非虚线 merge）。
- 节点加 `--color-surface` halo 压在边上，Main Agent 带根环。
- 点击高亮 = 选中强高亮 + 祖先/后代 5% accent tint，不做 opacity 降级。
- 工具栏仅主题切换 + 清除选择；无日期/Agent 过滤、无缩放/平移、无 minimap、无全屏、无折叠。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/trace-view-trajectory-tree.html` | `archive` | 长期价值：定义了轨迹树的可复用视觉/交互契约（节点按 kind 形状、多 lane 分叉/并回、路径高亮不降透明、5 路清除选择），并提供可执行状态矩阵（done/running/failed/waiting）与亮/暗主题切换，文字 spec 与代码无法等价表达。有效性：与最终实现一致（widget 沿用其形状/lane/边/高亮/清除语义）、已浏览器验证并经原型确认、无更新版本替代、归属当前 change。 |

## Prototype Status

（UI 变更，不适用 stub）

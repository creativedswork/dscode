## Prototype Files

- `docs/prototypes/trace-tree-view-git-branches.html` — 自包含单文件交互原型，展示 git 分支可视化的 Trace 轨迹树：每个 Agent 一条纵向 lane（分支线），消息/工具为 lane 上节点（agent=菱形、user=空心圆、assistant=实心点、tool=方块），SubAgent 从 spawn 工具点向右分叉、结束虚线并回父 lane。默认紧凑密度（行高 24px、mono 标签、少留白），支持亮/暗主题、紧凑/宽松密度、done/running/waiting/error 状态、折叠分支、点击节点详情、图例。视觉对齐 `--color-*` warm design system tokens + git 分支多色 lane。

关键视觉与交互决策（经原型确认）：
- Agent = 纵向 lane（分支线），按 fork 顺序向右分配，lane 颜色按 git 风格调色板区分（Main=琥珀、子分支=teal/blue/purple…）。
- 路径内消息链式嵌套：user→assistant→tool→assistant 连成一根脊柱；分叉只来自 tool 侧枝与 SubAgent fork。
- tool 合并为单节点（方块 + 状态点：done=绿/running=琥珀脉冲/error=红/waiting=空心）。
- SubAgent 分叉 = 向右 elbow 曲线；结束 = 虚线 elbow 并回父 lane。
- 紧凑密度默认开启，少留白、清晰可读；节点 label 用 mono 字体。
- 详情面板按 kind 分派字段；折叠分支收起 SubAgent 子树并显示 `+N`。

## Prototype Retention

| File | Decision | Rationale |
|---|---|---|
| `docs/prototypes/trace-tree-view-git-branches.html` | `archive` | 通过长期价值门（定义 git 分支拓扑、紧凑密度、分叉/合并与状态矩阵的可执行视觉契约，被 proposal/design 引用为实现依据）与有效性门（与最终实现及 design tokens 一致、无更新替代、归属当前 change） |
| `docs/prototypes/trace-tree-view-main.html` | `delete` | 被新 git 分支原型取代（旧拓扑：session 根 + 平铺兄弟），实现后删除 |

## Prototype Status

（UI 变更，不适用 stub）

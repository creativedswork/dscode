## 1. 简化投影（src/ui/shared/trace-tree.ts）

- [x] 1.1 从 `TraceNode` 类型删除 `mergeTargetId` 字段，并移除 `projectPath` 中 `lastSpineNode(child).mergeTargetId = mergeTarget.id` 的合并关系赋值
- [x] 1.2 简化 `assignLanes`：main=0，每个 `spawn_agent` fork 分配一个递增的新 lane，删除 free/alloc/release 回收逻辑
- [x] 1.3 删除 `computeTraceRuns` / `applyTraceFolds`（线性折叠）与 `filterTraceTreeByDate` / `filterTraceTreeByAgent` / `applyTraceFilters`（过滤）
- [x] 1.4 删除 `listTraceAgents`，`projectTraceTree` 改用内联 DFS 统计 SubAgent 数量写入根节点 summary
- [x] 1.5 确认 `buildAgentNode` / `buildMessageNode` / `buildMainToolNode` / `buildAgentToolNode` / `synthesizeFallbackMessages` / `projectPath` 其余逻辑不变

## 2. 重写轨迹树 widget（web/src/utils/traceWidget.ts）

- [x] 2.1 重写 `WIDGET_TEMPLATE`：移除日期过滤、Agent 筛选、缩放/fit、minimap、全屏、折叠开关，工具栏仅保留主题切换与清除选择
- [x] 2.2 实现树式 SVG 渲染：节点按 kind 形状（agent=菱形、user=空心圆、assistant=实心点、tool=方块）+ `--color-surface` halo，Main Agent 根环，多 lane 分叉，边为父→子细 cubic-bezier（同 lane 竖线、跨 lane 曲线 elbow），fork 用子分支色、return 用 muted 实线
- [x] 2.3 实现路径高亮交互：点击高亮「选中 + 祖先 + 后代」，其余节点全正常显示（不做 opacity 降级）
- [x] 2.4 实现清除选择：`Esc` / 点击空白 / 再次点击已选节点 / 工具栏 ✕ / 详情 ✕
- [x] 2.5 保留节点详情面板按 kind 分派字段、大 result 折叠、空态与 `applyArtifactTheme` 主题 token 注入

## 3. 测试与校验

- [x] 3.1 更新 `tests/ui/trace-tree.test.ts`：删除 `mergeTargetId`、lane 回收、线性折叠、日期/Agent 过滤相关断言
- [x] 3.2 新增/保留断言：链式嵌套、tool 单节点、SubAgent 分叉、并回（无 merge 关系）、transcript 加载与退化
- [x] 3.3 `npm run typecheck` 通过
- [x] 3.4 `npm test` 全量通过

## 4. 收尾

- [x] 4.1 浏览器验证 dashboard 注入后的轨迹树 widget：点击高亮路径、清除选择、亮暗主题
- [x] 4.2 按长期价值门与有效性门判定 `docs/prototypes/trace-view-trajectory-tree.html` 为 `archive` 或 `delete`，更新 `prototype.md`

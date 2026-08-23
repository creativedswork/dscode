## 1. 后端 lane 复用（投影）

- [x] 1.1 重构 `src/ui/shared/trace-tree.ts` 的 `assignLanes`：DFS 时 fork 分配空闲 lane、SubAgent 子树结束（merge 点）后回收，横向 lane 数 = 最大嵌套深度
- [x] 1.2 确保 lane 分配与渲染端 DFS 布局顺序一致（continuation-first），子树为连续块
- [x] 1.3 为 lane 复用编写单元测试：兄弟 SubAgent 复用 lane、嵌套 SubAgent 独占新 lane、`ownerAgentId` 归属不变

## 2. 可读默认视图 + 缩放

- [x] 2.1 修改 `web/src/utils/traceWidget.ts`：默认以固定节点尺寸（~22px 高 / ~30px 行距）渲染并纵向滚动，移除加载/全屏时的 `fitView` 自动适配
- [x] 2.2 `fit view` 降级为 toolbar 手动按钮，缩放改为 Ctrl+滚轮（光标为锚）+ 工具栏 `±`
- [x] 2.3 保证节点点击、折叠、过滤、全屏等既有交互在滚动视图下正常

## 3. minimap 总览

- [x] 3.1 新增右侧 minimap 渲染：极简缩略图（lane 线 + 节点点 + 边，无标签）
- [x] 3.2 叠加视口框，随主画布 `scrollLeft/scrollTop` 与 `zoom` 实时映射更新
- [x] 3.3 实现 minimap 点击跳转（映射到主画布滚动位置）
- [x] 3.4 仅在可读滚动视图渲染 minimap，fit 视图隐藏

## 4. 线性长链折叠

- [x] 4.1 实现「无聊节点」判定（非 agent、无 merge、恰一个非 agent 子节点）与最大线性 run 识别（长 ≥3）
- [x] 4.2 折叠中间节点为 `⋯N`，保留 run 首尾节点；合并目标（spawn continuation）不被折叠
- [x] 4.3 实现 `⋯N` 点击展开/再折叠，折叠只影响视图、不改底层树数据
- [x] 4.4 编写线性折叠单元测试：run 识别、首尾保留、merge 目标保留、展开/再折叠

## 5. 内容自适应宽度

- [x] 5.1 `.trace-widget` 容器改为 `width: fit-content; max-width: 100%`，不再铺满 UI 宽
- [x] 5.2 `.canvas-wrap` 宽度由 JS 设为 `min(内容自然宽 × zoom, 可用宽)`，超宽才横向滚动
- [x] 5.3 minimap/详情面板作为内容宽度的一部分，卡片居中且留白
- [x] 5.4 添加窗口 resize 重排，验证窄树收缩、超宽树封顶、缩放影响画布宽

## 6. 验证与收尾

- [x] 6.1 运行 `npm run typecheck`、`npm test`、`npm run build` 确保通过
- [x] 6.2 浏览器验证：可读默认、滚动、Ctrl+滚轮缩放、minimap 同步与点击跳转、线性折叠展开、lane 复用、内容宽度收缩、亮暗主题、日期/Agent 过滤、全屏、空态
- [x] 6.3 依据 `prototype-workflow` 对 `docs/prototypes/trace-tree-view-readable-overview.html` 判定 `archive` 或 `delete`，更新 `prototype.md` Retention 表

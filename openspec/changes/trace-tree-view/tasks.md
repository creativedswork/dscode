## 1. 后端投影与 SubAgent transcript 加载

- [x] 1.1 新增后端 Trace 投影入口，输入 = Session messages + `AgentProcessStore.loadMany()` 的 `runtimeSnapshot.messages`，输出结构化 Trace 树
- [x] 1.2 对每个 SubAgent transcript 复用 `rebuildDisplayMessages` 做 raw→display 投影（复用现有 session-projector 逻辑）
- [x] 1.3 递归处理嵌套 SubAgent（依据 `parentAgentId` 与 spawn 工具结果匹配 agentId）
- [x] 1.4 定义下发协议（WebSocket 事件或 artifact 载荷），承载后端投影的 Trace 数据
- [x] 1.5 为 transcript 缺失的 SubAgent 提供「input → tools → output」退化呈现，不丢弃节点

## 2. Trace 节点模型与拓扑投影

- [x] 2.1 重定义 `TraceNode`（`agent | user | assistant | tool | system`，`tool` 合并 call+result，携带 lane/ownerAgentId）
- [x] 2.2 以 Main Agent 为路径根投影，移除虚拟 `session` 根与 `tool_result` 独立节点
- [x] 2.3 实现链式嵌套：消息按历史顺序、parent=上一个节点；新 user 继续脊柱
- [x] 2.4 实现 tool 单节点语义：同 assistant 多 tool 为兄弟，链从最后一个 tool 继续
- [x] 2.5 实现 SubAgent 分叉/合并：spawn 工具分叉 agent 路径根，结束并回父路径
- [x] 2.6 为投影、链式嵌套、tool 合并、分叉/合并、递归 transcript 加载编写单元测试

## 3. git 分支渲染

- [x] 3.1 实现无第三方依赖的 git lane 布局（Agent=lane、fork 向右分配、merge 虚线并回）
- [x] 3.2 按 kind 渲染节点（agent 菱形 / user 空心圆 / assistant 实心点 / tool 方块 + 状态点），lane 多色区分
- [x] 3.3 默认紧凑密度（行高 ~24px、mono 标签、少留白），并提供密度切换
- [x] 3.4 实现以光标为中心的滚轮缩放与空白处拖拽平移、fit view
- [x] 3.5 实现分支折叠/展开（收起 SubAgent 子树并显示 `+N`）

## 4. 交互与过滤

- [x] 4.1 实现节点点击详情面板（按 kind 分派：消息正文/thinking、工具 args/result、Agent role/state/input/output）
- [x] 4.2 实现日期范围过滤（幽灵祖先保连通、无时间戳 Agent 根永不过滤）
- [x] 4.3 实现按 Agent 筛选（ownerAgentId + 幽灵祖先，与日期过滤 AND 叠加）
- [x] 4.4 实现亮暗主题与图例

## 5. Dashboard 内嵌与全屏

- [x] 5.1 更新 `session_dashboard` artifact prompt 预留 `<div id="trace-tree">` 占位块
- [x] 5.2 实现客户端后处理：注入自包含 git 分支 widget（后端投影数据 + SVG + 脚本 + 样式）到 `#trace-tree`
- [x] 5.3 保持 `session_dashboard` iframe sandbox `allow-same-origin allow-scripts`，注入前剥离 LLM HTML 既有 `<script>`
- [x] 5.4 实现 widget 全屏开关：覆盖 iframe 视口、再点恢复；不改 `viewMode`、不触发报告重生成
- [x] 5.5 实现空态与 Main-only 场景

## 6. 样式、验证与收尾

- [x] 6.1 在 `web/src/index.css` 复用 `--color-*` tokens 实现 git 分支 Trace 块样式，不新增第三方组件库
- [x] 6.2 运行 `npm run typecheck`、`npm test`、`npm run build` 确保通过
- [x] 6.3 浏览器验证：Dashboard 内嵌、全屏、缩放、平移、折叠、详情、日期/Agent 过滤、亮暗主题、空态、git lane 拓扑
- [x] 6.4 依据 `prototype-workflow` 对 `docs/prototypes/trace-tree-view-git-branches.html`（pending）与 `trace-tree-view-main.html`（superseded）判定 `archive`/`delete`，更新 `prototype.md` Retention 表

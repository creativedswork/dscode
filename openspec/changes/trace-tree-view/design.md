## Context

WebUI 的 Session Dashboard 首次实现的 Trace 轨迹树（`src/ui/shared/trace-tree.ts` 的 `projectTraceTree`）以虚拟 `session` 为根，把 user/assistant 消息按时间平铺为根的直接子节点。这产生两个问题：(1) 一个多轮 Session 在顶层冒出大量并列 Assistant 节点，丢失「它们都属于 Main Agent」的归属感；(2) SubAgent 仅以单个 `agent` 节点（`agentActivity` 摘要）呈现，无法看到其内部的 `user → assistant → tool` 链。本设计纠正拓扑：以 Agent 为路径根、消息按历史顺序链式嵌套、SubAgent 从 spawn 点分叉独立路径并结束并回；并加载 SubAgent 完整 transcript（A2）复现内部链，用 git 分支可视化紧凑渲染。

## Goals / Non-Goals

**Goals:**
- 以 Agent 为路径根投影 Trace 树，路径内消息按历史顺序链式嵌套。
- `tool` 合并为单节点（call+result），同 assistant 多 tool 为兄弟、链从最后一个 tool 继续。
- SubAgent 从 spawn 工具点分叉独立路径、结束并回父路径，嵌套递归。
- 后端加载 SubAgent 完整 transcript，复现其内部链（A2）。
- git 分支可视化：Agent = lane，紧凑密度、少留白、清晰可读。
- 保留缩放/平移、折叠、详情、日期/Agent 过滤、全屏。

**Non-Goals:**
- 不新增顶层视图模式（不改 `ViewMode`、`ViewModeSelector`、`MessageInput`）。
- 不做 force-directed 可拖拽重排（「拖动」仅平移画布）。
- 不做跨 Session 聚合 Trace。
- 不做 Trace 的编辑、回放或导出。

## Decisions

### D1 — 后端投影 + SubAgent transcript 加载（A2）
Trace 树由后端从 Session 消息 + Agent Process transcripts 构造，经结构化载荷下发客户端。对每个 SubAgent，用 `AgentProcessStore.loadMany()` 读取 `runtimeSnapshot.messages`，复用 `rebuildDisplayMessages` 做 raw→display 投影，递归处理嵌套 SubAgent。选择理由：SubAgent 完整链只有后端可靠可得（`runtimeSnapshot.messages` 存于 process store）；`rebuildDisplayMessages` 本就在后端，嵌套 `parentAgentId`/`messageIndex` 归属也只有后端能解析。备选（客户端按需拉取 transcript）需把 `rebuildDisplayMessages` 变成可共享纯函数且协议面更复杂，不取。

### D2 — 节点模型（Agent 根 + tool 单节点）
`TraceNode` 为 `{ id, kind, label, ts, lane, children, payloadRef, ownerAgentId }`，`kind` 覆盖 `agent | user | assistant | tool | system`。移除 `session` 根与 `tool_result` 独立节点（`tool` 单节点承载 call+result，详情分区展示 args/result）。`lane` 记录所属 Agent 路径（= `ownerAgentId`），供 git lane 渲染与按 Agent 筛选。

### D3 — 层级规则（链式嵌套 + 分叉/合并）
- 根 = Main Agent 节点（路径根）。
- 路径内消息按历史顺序链式嵌套：每个节点的 parent = 它回应的上一个节点（`user → assistant → tool → assistant → …`）；新的 user 消息继续挂在上一轮最后一个节点下（连续脊柱）。
- `assistant` 的 `tools` 合并为 `tool` 子节点（兄弟）；若 assistant 无 tool，则下一个消息挂在该 assistant 下。
- 链从**最后一个** `tool` 节点继续（assistant 有多个 tool 时，前面的 tool 为侧枝）。
- `spawn_agent` tool 节点额外**分叉**出一个 `agent` 子节点（SubAgent 路径根）；SubAgent 路径结束的节点通过**合并**关系回到父路径的下一个节点。
- 嵌套 SubAgent 递归应用同一规则。

### D4 — git 分支渲染
每个 Agent 路径渲染为一条纵向 lane（分支线），按 fork 顺序向右分配 lane，lane 颜色按调色板区分。消息/工具为 lane 上节点（agent=菱形、user=空心圆、assistant=实心点、tool=方块）。spawn = 从父 lane 向右分叉（elbow 曲线）；SubAgent 结束 = 虚线并回父 lane（elbow 曲线）。默认紧凑密度（行高 ~24px、mono 标签），少留白。纯手写布局 + SVG `<g>`/`<path>`，缩放/平移经外层 `<g transform>`。

### D5 — 交互模型
滚轮/触控板以光标为中心缩放；空白处拖拽平移；节点点击详情；分支折叠/展开（折叠 SubAgent 子树，收起节点显示 `+N` 提示）；toolbar 提供 fit view、日期过滤、按 Agent 筛选、图例、全屏、亮暗主题。详情按 `kind` 分派：消息正文/thinking、工具 args/result（分区）、Agent application/role/state/input/output/tool timeline。

### D6 — 日期过滤保留连通结构
起止日期过滤作用于节点 `ts`：窗口外节点隐藏，其必要祖先保留为「幽灵」占位（不可点击、弱化），保证树/lane 不断裂；无时间戳节点（Agent 路径根）永不过滤。

### D7 — Dashboard 内嵌与全屏
Trace 以内容 widget 嵌入 Dashboard 报告内容流（`<div id="trace-tree">` 占位），客户端注入自包含 git 分支 widget（后端投影数据 + SVG + 脚本 + 样式）。`session_dashboard` iframe sandbox 放宽为 `allow-same-origin allow-scripts`，注入前剥离 LLM HTML 既有 `<script>`。全屏 = widget 覆盖 iframe 视口，再点恢复；不改 `viewMode`、不触发报告重生成、不渲染 MessageInput。

### D8 — 按 Agent 筛选保留连通结构
每个节点携带 `ownerAgentId`（= 所属 lane/Agent）。toolbar Agent 下拉（「全部」+ Main + 各 SubAgent，单选）：命中节点显示，其余隐藏但必要祖先保留幽灵占位；与日期过滤 AND 叠加。

## Risks / Trade-offs

- [SubAgent transcript 加载放大数据量/内存] → 后端按需加载（仅当前 Session 的 SubAgent），投影产物用 payloadRef 引用原数据不复制大 result；详情面板复用 `ToolResultProjection` 摘要按需展开。
- [连续脊柱让树变得很深很窄] → 默认紧凑密度 + 分支折叠 + fit view；深层分支默认折叠。
- [多 SubAgent 导致 lane 数膨胀、横向拥挤] → lane 按 fork 顺序分配、超宽时横向平移 + fit view；颜色调色板循环使用。
- [历史/边界数据缺失（无 parentAgentId、transcript 丢失）] → 挂载失败回退到 Main 路径并标记 `unattached`，不丢弃节点；transcript 缺失的 SubAgent 退化为「input → tools → output」摘要呈现。
- [iframe 放宽 `allow-scripts` 扩大安全面] → 注入前剥离 LLM HTML 既有 `<script>`，只注入可信 widget 脚本；数据仅来自后端结构化投影。

## Open Questions

- 合并 edge（SubAgent 结束并回父路径）是否在首版就绘制，还是仅以「路径终止 + 详情查看 output」表达（暂定绘制虚线合并 edge）。
- lane 调色板是否固定 7 色循环，还是按 Agent 数量动态生成（暂定固定调色板循环）。

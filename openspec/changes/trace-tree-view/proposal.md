## Why

Session Dashboard 的 Trace 轨迹树首次实现把 `session` 作为虚拟根、把 user/assistant 消息按时间平铺成根的直接子节点。这导致一个多轮 Session 在顶层冒出大量并列的 Assistant 节点——它们其实都属于 Main Agent，却被拍平成「多个助手」，丢失了「每个 Agent 是一条执行路径」的结构。本变更纠正投影拓扑：以 **Agent 为路径根**，路径内消息按历史顺序链式嵌套（`user → assistant → tool → assistant`），SubAgent 从 spawn 点分叉出独立路径、结束再并回父路径；并加载 SubAgent 完整 transcript 复现其内部链，用 git 分支可视化紧凑呈现。

## What Changes

- 纠正树拓扑：根 = Main Agent（路径根），不再是虚拟 `session`；消息之间按历史顺序**链式嵌套**（每个节点的 parent = 它回应的上一个节点），而非平铺兄弟。
- `tool` 由 `tool_call → tool_result` 两级**合并为单节点**（call+result 同节点、详情分区展示）；同一 assistant 的多个 tool 为兄弟，链从最后一个 tool 继续。
- SubAgent 从 `spawn_agent` 工具点**分叉**为独立路径（新 lane），结束**虚线并回**父路径；嵌套 SubAgent 递归分叉。
- 加载 SubAgent 完整 transcript（`SerializedAgentProcess.runtimeSnapshot.messages`）复现其内部 `user → assistant → tool → assistant` 链（A2），投影从纯客户端改为**后端投影**并下发结构化 Trace 数据。
- 渲染改为 **git 分支可视化**：每个 Agent 一条纵向 lane（分支线），消息/工具为 lane 上节点，紧凑密度、少留白。
- 保留既有交互：缩放/平移、折叠、节点详情、日期过滤、按 Agent 筛选、全屏。

## Capabilities

### New Capabilities

- `trace-tree-view`: 定义以 Agent 为路径根的 Trace 轨迹树投影、链式嵌套与 tool 单节点语义、SubAgent 分叉/合并、SubAgent transcript 加载（递归）、git 分支渲染、日期与 Agent 过滤、缩放/平移/折叠/详情/全屏，以及在 Session Dashboard 中的内嵌。

### Modified Capabilities

- `session-dashboard`: 将 Dashboard 从单一 LLM 报告扩展为「报告内容流 + Trace 内容 widget」，定义 Trace widget 的 slot 注入、全屏展开/恢复与只读语义。

## Impact

- **投影逻辑**：`src/ui/shared/trace-tree.ts` / `trace-tree-projection.ts` 从「session 根 + 平铺」改为「Main Agent 根 + 链式 + SubAgent 分叉/合并」。
- **SubAgent transcript 加载**：新增后端投影入口，读取 `AgentProcessStore.loadMany()` 的 `runtimeSnapshot.messages`，对每个 SubAgent 复用 `rebuildDisplayMessages` 做 raw→display 投影，递归处理嵌套 SubAgent。
- **协议**：Trace 数据改为后端结构化下发（新 WebSocket 事件或 artifact 载荷），客户端 widget 消费投影结果而非自行投影。
- **Web 前端**：`session_dashboard` 预留 `<div id="trace-tree">` 占位；客户端注入 git 分支 SVG widget；iframe sandbox 保持 `allow-scripts`。**不改** `ViewMode`、`ViewModeSelector`、`MessageInput`。
- **样式**：`web/src/index.css` 复用 `--color-*` tokens + git 分支多色 lane。
- **测试**：投影单测覆盖链式嵌套、tool 合并、SubAgent 分叉/合并、递归 transcript 加载、日期/Agent 过滤；渲染与注入覆盖测试。
- **UI 依据**：`docs/prototypes/trace-tree-view-git-branches.html`（explore 阶段生成并确认的 git 分支原型）。

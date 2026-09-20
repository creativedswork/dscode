## 变更综述

Session Dashboard 的 Trace 视图经历了「首次引入 → 可读性增强 → 语义收束」三段演进。最初 `trace-tree-view` 引入以 Agent 为路径根的轨迹树投影，把平铺的消息纠正为链式嵌套、SubAgent 分叉/合并，并用 git 分支可视化呈现；随后 `trace-view-readable-overview` 针对大型 Session 的可读性，引入固定节点尺寸 + 滚动、minimap 总览、线性长链折叠与 lane 复用；最终 `trace-view-trajectory-tree` 发现「做成 VSCode Git Graph 的样子」被字面实现成了 git 分支语义（虚线 merge、lane 回收、`⋯N` 折叠、日期/Agent 过滤），且点击聚焦会压暗整棵树、选择无法清除——于是把渲染收束为**轨迹树**（节点按 kind 形状 + 父→子细曲线边，Main Agent 为根），修正为「高亮选中 + 祖先/后代路径、其余全正常、不降透明度」并补全清除选择入口，同时移除全部字面 git 语义与非必要的导航控件。

## 变更时间线

- 2026-08-15: `trace-tree-view` — 首次引入 Trace 轨迹树（Agent 根 + 链式嵌套 + SubAgent 分叉/合并 + git 分支可视化）
- 2026-08-17: `trace-view-readable-overview` — 大型 Session 可读导航（固定节点尺寸 + 滚动、minimap、线性折叠、lane 复用、内容自适应宽度）
- 2026-08-18: `trace-view-trajectory-tree` — 收束为轨迹树，修正交互并移除字面 git 语义

## 初始设计

最初想解决的问题：Session Dashboard 的 Trace 首次实现以 `session` 为虚拟根、把 user/assistant 消息按时间平铺成根的直接子节点，导致多轮 Session 顶层冒出大量并列 Assistant 节点，丢失「每个 Agent 是一条执行路径」的结构。

设计思路：以 **Agent 为路径根**，路径内消息按历史顺序链式嵌套（`user → assistant → tool → assistant`）；`tool` 由 call/result 两级合并为单节点；SubAgent 从 `spawn_agent` 点分叉为独立路径、结束并回父路径，并加载完整 transcript 复现内部链；渲染改为 git 分支可视化（每个 Agent 一条纵向 lane）。

## 变更记录

### 变更: 可读默认视图替代 fit view + minimap + 线性折叠 + lane 复用
- **触发**: 用户反馈「trace 内容非常小」「trace view 能不能适配内容、别占满整个 UI 宽」。
- **改动**: 默认视图从 fit 缩放改为固定节点尺寸 + 滚动；新增右侧 minimap 总览；折叠扩展为 gitk `⋯N` 线性长链折叠；`assignLanes` 从递增不回收改为 fork 分配 / merge 回收；widget 宽度适配内容。
- **影响**: `web/src/utils/traceWidget.ts`、`src/ui/shared/trace-tree.ts` 及对应单测。

### 变更: 收束为轨迹树 + 修正交互
- **触发**: 点击节点会把选中子树之外全部压到低透明度（用户感知「整棵树丢了」）；选择单向粘住、无清除/返回入口；「做成 VSCode Git Graph 的样子」被字面实现成 git 分支语义，用户从未要求。
- **改动**: 渲染改为「节点 + 父→子细曲线边」的轨迹树（节点按 kind 形状区分、Main Agent 为根）；点击高亮「选中 + 祖先 + 后代」且不降透明度；新增 `Esc`/空白/再次点击/工具栏 ✕/详情 ✕ 五路清除选择；移除 `mergeTargetId` 虚线合并、lane 回收、`⋯N` 折叠、日期/Agent 过滤、缩放/minimap/全屏。
- **影响**: `src/ui/shared/trace-tree.ts`、`web/src/utils/traceWidget.ts`、`tests/ui/trace-tree.test.ts`、`tests/ui/trace-widget.test.ts`。

## 修复记录

（无 — 本旅程的三段 change 均为设计与行为演进，不涉及独立 bug-fix change。）

## 最终状态

本 change（`trace-view-trajectory-tree`）为最终交付。核心结果：

- **投影**：`src/ui/shared/trace-tree.ts` 移除 `mergeTargetId`、lane 回收、线性折叠、日期/Agent 过滤；保留 Agent 根投影、链式嵌套、tool 单节点、SubAgent 分叉与 transcript 加载；`assignLanes` 简化为 main=0、每个 fork 递增新 lane 且不回收。
- **渲染与交互**：`web/src/utils/traceWidget.ts` 重写为树式 SVG 渲染（agent=菱形、user=空心圆、assistant=实心点、tool=方块 + `--surface` halo、Main Agent 根环、多 lane 分叉/并回、fork 子分支色 / return muted 实线边）；点击高亮路径不降透明；清除选择五路入口；详情面板按 kind 分派、大 result 折叠、空态与主题 token 注入保留。
- **取代关系**：本变更取代未归档的 `trace-tree-view` 与 `trace-view-readable-overview` 中 git 分支可视化的投影与渲染语义。

完整能力与 requirement 见 `specs/trace-view-trajectory-tree/spec.md` 与 `specs/session-dashboard/spec.md`；实现清单见 `tasks.md`；视觉依据为 `docs/prototypes/trace-view-trajectory-tree.html`（判为 archive）。

# Consolidate: web-thinking-timer

## 变更综述

本 change 聚焦 WebUI 思考阶段（Thinking）的用户体验闭环：从最初发现"Thinking 期间无任何计时或活性指示"这一问题，到实现实时计时、定格总结、停滞检测三项核心功能，再到发现并修复 cascade 动画中 Thinking/Executing/Response 标签残留的渲染 bug。相关变更跨越 cascade 动画引擎的引入与迭代（chat-to-dashboard-transition 系列），最终将所有思考阶段的显示元素纳入统一的生命周期管理。

## 变更时间线

- 2025-01-16: `fix-cascade-row-reorder` — 修复 cascade 阶段 DOM 变异后行重排导致的 cluster 跳跃
- 2026-05-31: `fix-web-thinking-timer-and-stop-button` — 修复 thinking 计时器 0s 和停止按钮状态 bug（`assistant_end` 越权重置 `processing`）
- 2026-06-26: `chat-to-dashboard-transition` — 首次实现 Chat→Dashboard 的 Cascade Canvas 转场动画（hop-step cluster + 粒子系统）
- 2026-07-03: `fix-cascade-collider-coverage` — 补全 ToolCard 的 `data-collider` 属性，打击方式从 DOM 变异改为 clone+overlay
- 2026-07-11: `chat-dashboard-transition` — ThinkingBlock 加入 cascade active strike tier + timestamp 近距溶解效果

## 初始设计

（此为 web-thinking-timer 的首个 proposal）

**问题**：WebUI 在模型流式输出 thinking 期间，`WaitingBubble`（带计时）在首个 `thinking_delta` 后消失，`ThinkingBlock` 仅显示静态 label。用户无法区分"模型正在长考"与"请求已卡住"。且 spec 要求 `ThinkingBlock` 显示 `Thinking... (Xs)`，实现中有半成品 plumbing（`sessionTime` prop）但从未渲染。

**方案**：
- Per-thinking anchor 计时（`thinkingStartedAt`），每段思考独立
- 流式 `Thinking · Xs` → 结束定格 `Thought for Xs`
- 纯前端停滞检测（15s 无 delta → warning 态）
- 零后端/协议变更

## 变更记录

### 变更: 计时锚点从 turnStartRef 修正为 per-thinking anchor
- **触发**: `sessionTime` 是 session 累计时间（长 session 显示 "47m 12s"），`turnStartRef` 是整轮锚点（工具+思考交错时起点远早于思考起点），两者语义均不对。
- **改动**: reducer 在首个 `thinking_delta` 记录 `thinkingStartedAt`，`text_delta`/`tool_start` 时清除，下一段重新计时。组件内本地 1s interval 驱动 tick。
- **影响**: `src/ui/shared/types.ts`（UIMessage 新增字段）、`src/ui/shared/reducer.ts`、`ChatView.tsx`（ThinkingBlock 重写计时逻辑）、`web/src/index.css`（脉冲动画）

### 变更: ThinkingBlock 加入 cascade active strike tier
- **触发**: cascade 动画最初保留 thinking blocks 不摧毁，但 thinking 结束后残留在冻结的 ChatView 中显得突兀。
- **改动**: `.thinking` block 加 `data-collider="thinking-block"`，cascade 时 gentle dissolve（opacity fade + light particles），无字符散射。
- **影响**: `TransitionCanvas.tsx`（新 destroyThinkingBlock + buildRowList 识别 thinking-block）、`ChatView.tsx`（ThinkingBlock 加 data-collider）

## 修复记录

### 修复: cascade 动画中 phase label 残留
- **症状**: chat → dashboard 时，cascade 动画掠过 Thinking/Executing/Response 标签但不摧毁它们。动画结束后直到 React viewMode 切换前，标签残留在透明的 TransitionCanvas 下方可见。
- **根因**: `TransitionCanvas.buildRowList()` 通过 `querySelectorAll("[data-collider]")` 选取元素，`.phase-label` div 没有 `data-collider` 属性 → 对动画引擎不可见 → 不被摧毁。thinking-block 已在 2026-07-11 加入 strike tier，但 assistant message 中的 phase label 仍是盲区。
- **修复**: `ChatView.tsx` 的 `AssistantMessage` 中三处 `.phase-label` 各加 `data-collider="phase-label"`（Thinking L388 / Executing L405 / Response L439）。无需 CSS/JS 变更，cascade 引擎统一处理 `[data-collider]` 元素。
- **验证原型**: `docs/prototypes/web-thinking-timer-phase-label-cascade.html`（左右对比：无 data-collider 残留 vs 有 data-collider 正确摧毁）

## 最终状态

### 完整交付内容

**ThinkingBlock 计时与活性指示**：
- 实时计时：流式期间 label 显示 `Thinking · Xs`，per-thinking anchor，每段独立
- 定格总结：思考结束 label 定格 `Thought for Xs`（Claude Code 风格），折叠后保留
- 停滞检测：15s 无 delta → warning 色边框 + `no output for Xs`，delta 恢复自愈
- 圆点脉冲：流式 1.2s ease-in-out，stalled 放缓至 2s，遵循 `prefers-reduced-motion`

**Phase label cascade 修复**：
- Thinking / Executing / Response 三处 `.phase-label` 各加 `data-collider="phase-label"`
- cascade 动画中与 text-line、tool-card、thinking-block 一起被摧毁
- 零 CSS/JS 变更，零新依赖

**影响范围**：
- `web/src/components/ChatView.tsx` — ThinkingBlock + phase label data-collider
- `src/ui/shared/reducer.ts` — thinkingStartedAt / thinkingUpdatedAt
- `src/ui/shared/types.ts` — UIMessage 新增字段
- `web/src/index.css` — 脉冲动画、stalled 样式
- 协议/后端：无变更
- TUI：无变更

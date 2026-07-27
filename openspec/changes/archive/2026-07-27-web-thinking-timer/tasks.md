# Tasks: web-thinking-timer

设计依据：`design.md`（D1–D6）｜视觉基准：`docs/prototypes/web-thinking-timer-label-variants.html`

## 1. Shared model & reducer（计时锚点，D1/D5）

- [x] 1.1 `src/ui/shared/types.ts`：`UIMessage` 新增 `thinkingStartedAt?: number` 与 `thinkingUpdatedAt?: number`（epoch ms，可选，不持久化、不进协议）
- [x] 1.2 `src/ui/shared/reducer.ts`：`thinking_delta` 分支——若 message 无 `thinkingStartedAt` 则记录为 `Date.now()`；每次 delta 刷新 `thinkingUpdatedAt`
- [x] 1.3 `src/ui/shared/reducer.ts`：`text_delta` 与 `tool_start` 分支——清除 `thinkingStartedAt`（分段信号），保留下一段思考重新计时的能力

## 2. ThinkingBlock 组件（web/src/components/ChatView.tsx，D2/D3/D4）

- [x] 2.1 流式期间挂组件本地 `setInterval(1s)` 驱动重渲染，结束/卸载清理；从 `thinkingStartedAt` 计算本段已耗时长
- [x] 2.2 label 渲染 `Thinking · Xs`：复用现有 `formatTime()`，数字用 Geist Mono + `tabular-nums`
- [x] 2.3 思考结束（`isStreaming` 结束或正文/工具出现）时冻结最终耗时，label 切换为 `Thought for Xs`，折叠态保留，数字不再跳动
- [x] 2.4 停滞检测：tick 中计算 `now - thinkingUpdatedAt`，>15s 加 `stalled` class 并追加 `no output for Xs`；新 delta 到达自动清除；定格后不再检测
- [x] 2.5 清理半成品 plumbing：移除 `ThinkingBlock` 未使用的 `sessionTime` prop 及上游传递（`AssistantMessage`）

## 3. 样式（web/src/index.css，D6）

- [x] 3.1 流式圆点脉冲 keyframes（opacity 0.35↔1 + scale 1↔1.25，1.2s ease-in-out），`prefers-reduced-motion` 下禁用
- [x] 3.2 `.thinking.stalled`：左边框与圆点变 `--color-warning-text`，圆点脉冲放缓至 2s，`.stall-note` warning 色 Geist Mono
- [x] 3.3 `.thinking.done`：圆点静止（opacity 0.35），无动画

## 4. 测试与验证

- [x] 4.1 新增 `tests/ui/reducer.test.ts`：覆盖 `thinkingStartedAt`/`thinkingUpdatedAt` 的记录、`text_delta`/`tool_start` 后的清除与下一段重新记录
- [x] 4.2 `npm run typecheck` 通过
- [x] 4.3 `npm test` 通过（含新增 reducer 测试）
- [ ] 4.4 手动验证（`npm start -- --web`）：流式思考显示实时计时与脉冲圆点；结束定格 `Thought for Xs` 并折叠；与原型视觉一致（light/dark 两主题）
- [ ] 4.5 停滞态验证：通过断网/节流或临时调低阈值（如 3s）确认 stalled 样式与自愈行为，验证后恢复阈值 15s

## 5. Phase label cascade 修复（web/src/components/ChatView.tsx）

- [x] 5.1 `AssistantMessage` 中 Thinking phase label（约 L388）：`<div className="phase-label">` → `<div className="phase-label" data-collider="phase-label">`
- [x] 5.2 `AssistantMessage` 中 Executing phase label（约 L405）：`<div className="phase-label">` → `<div className="phase-label" data-collider="phase-label">`
- [x] 5.3 `AssistantMessage` 中 Response phase label（约 L439）：`<div className="phase-label">` → `<div className="phase-label" data-collider="phase-label">`
- [x] 5.4 `npm run typecheck` 通过
- [ ] 5.5 手动验证：chat → dashboard cascade 动画后 Thinking/Executing/Response 标签被正确摧毁，无残留

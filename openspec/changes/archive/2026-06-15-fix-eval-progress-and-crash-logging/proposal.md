## Why

`/eval` 在分析 session 期间没有任何进度反馈 — 用户看到 "正在分析 session..." 后长时间等待毫无反应；同时 pipeline 内部 crash 时错误详情（stack trace、上下文）不会写入 `eval.log`，导致问题无法追溯诊断。

## What Changes

- **进度反馈**：`runCausalGraphPipeline`（<500 步）和 `runFocusPipeline`（≥500 步）均需要向 TUI 输出阶段性进度
- **Agent loop 进度转发**：`ProgressDisplay` 在 TUI 模式（有 `onLog`）下将工具调用进度通过 `onLog` 输出到 `addInfo`
- **Crash 日志**：`runEval` 的 catch 块中调用 `logEval` 写入完整错误信息和 stack trace 到 `eval.log`
- **`isWebMode` 解耦**：拆分 `ProgressDisplay` 的 `isWebMode` 为独立标志，使 TUI 场景下 spinner 和 `onLog` 可同时工作

## Capabilities

### New Capabilities
- `eval-progress-feedback`: `/eval` 运行期间向 TUI 输出阶段性进度（含 causal graph 6 步 + focus pipeline agent loop 工具调用）

### Modified Capabilities
- `eval-causal-graph`: `runCausalGraphPipeline` 添加 `onLog` 回调参数，在每个 LLM step 前后输出进度
- `eval-dashboard`: `ProgressDisplay` 在 TUI 模式下正确转发 agent loop 进度事件

## Impact

- `src/eval/index.ts` — `runEval` catch 块添加 `logEval` 调用
- `src/eval/llm.ts` — `runCausalGraphPipeline` 添加 `onLog` 参数和各 step 进度输出
- `src/eval/focus/progress.ts` — `ProgressDisplay` 拆分 `isWebMode`，`onPhaseProgress` 中调用 `onLog`
- `src/eval/focus/index.ts` — `runFocusPipeline` 无需改动（已传 `onLog`）
- `src/eval/focus/agent-loop.ts` — 无需改动（已通过 `onProgress` 发出事件）
- `src/eval/focus/scan.ts`、`zoom.ts`、`synthesize.ts` — 无需改动（已将 agent loop `onProgress` 桥接至 `ProgressDisplay.onPhaseProgress`）

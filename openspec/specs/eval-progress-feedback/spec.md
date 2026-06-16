# eval-progress-feedback Specification

## Purpose

`/eval` 运行期间通过 TUI 的 `addInfo` 通道向用户输出阶段性进度，覆盖 causal graph pipeline（6 个 Phase）和 focus pipeline（agent loop 工具调用事件）。两条路径采用一致的 Phase 风格消息格式。crash 时向 `eval.log` 写入完整错误信息。

## ADDED Requirements

### Requirement: Causal Graph Pipeline Progress

`runCausalGraphPipeline` SHALL 接受可选的 `onLog: (msg: string) => void` 回调参数。

每个 Phase 执行前后 SHALL 通过 `onLog` 输出进度消息，与 focus pipeline 的 `ProgressDisplay` 保持一致的 Phase 风格：
- Phase 开始：`"<emoji> Phase N/6: <phase description>..."`
- Phase 完成：`"✓ Phase N/6 完成"`

`onLog` SHALL NOT 调用 `console.error` 或其他终端输出方法。

Phase 映射：
- Phase 1/6: 🔍 分解子任务
- Phase 2/6: 🔗 识别子任务依赖
- Phase 3/6: 🤖 提取 Agent 节点
- Phase 4/6: 🔗 识别 Agent 依赖边
- Phase 5/6: 🎯 生成候选错误集
- Phase 6/6: ⚖️ 反事实归因

#### Scenario: Successful 6-phase analysis with progress

- **WHEN** `runCausalGraphPipeline` 被调用且 `onLog` 已提供
- **THEN** 系统 SHALL 在 Phase 1 开始前输出 `"🔍 Phase 1/6: 分解子任务..."`
- **AND** 在 Phase 1 完成后输出 `"✓ Phase 1/6 完成"`
- **AND** 对所有 6 个 Phase 重复此模式
- **AND** `onLog` SHALL NOT 向终端 stderr 输出任何内容
### Requirement: Focus Pipeline Phase Progress

`ProgressDisplay.onPhaseStart` SHALL 通过 `onLog` 输出 Phase 开始消息：
- Phase 0/4: `"⏳ Phase 0/4: 落盘..."`
- Phase 1/4: `"🔍 Phase 1/4: SCAN — 扫描 attention zones..."`
- Phase 2/4: `"🔎 Phase 2/4: ZOOM — 深潜分析..."`
- Phase 3/4: `"🧩 Phase 3/4: SYNTHESIZE — 归因分析..."`
- Phase 4/4: `"📊 Phase 4/4: 规则提取..."`

`ProgressDisplay.onPhaseDone` SHALL 通过 `onLog` 输出 `"✓ <summary>"` 格式的完成消息。

#### Scenario: Focus pipeline phase progress

- **WHEN** `runFocusPipeline` 执行各 Phase 时
- **THEN** TUI SHALL 按顺序显示 Phase 0/4 → Phase 4/4 的进度消息
- **AND** 消息格式与 causal graph pipeline 的 `"Phase N/M: ..."` / `"✓ Phase N/M 完成"` 风格一致

### Requirement: Focus Pipeline Agent Loop Progress

`ProgressDisplay.onPhaseProgress` 在已设置 `onLog` 回调时 SHALL 将工具调用进度通过 `onLog` 输出。

SHALL 对 `onLog` 调用施加节流（默认 500ms 间隔）：距上次调用不足 `throttleMs` 的 `onPhaseProgress` 事件 SHALL 跳过 `onLog` 调用但正常更新内部状态。

`onPhaseStart`、`onPhaseDone`、`showCompletion` 的 `onLog` 调用 SHALL NOT 受节流限制。

#### Scenario: Agent tool call progress forwarded to TUI

- **WHEN** agent loop 中发生工具调用且 `ProgressEvent` 被发出
- **THEN** `ProgressDisplay.onPhaseProgress` SHALL 调用 `onLog("  ⟳ <event.detail>")`
- **AND** 若与上次 `onLog` 调用间隔不足 500ms 则 SHALL SKIP

#### Scenario: Phase boundaries always logged

- **WHEN** `onPhaseStart` 或 `onPhaseDone` 被调用
### Requirement: Crash Error Logging

`runEval` 的 catch 块 SHALL 通过 Logger 写入完整错误信息到 `~/.dscode/logs/analysis.log`（使用 `Logger` 实例的 `error("analysis", "Pipeline", ...)`）。

若 `err` 为 `Error` 实例且包含 `stack`，SHALL 额外写入 `logger.error("analysis", "Pipeline", "stack:\n<stack>")`。

SHALL 仍然调用 `ui.addError(...)` 在 TUI 显示错误摘要。

#### Scenario: Pipeline crash logged to file

- **WHEN** `runCausalGraphPipeline` 或 `runFocusPipeline` 抛出异常
- **THEN** 系统 SHALL 调用 `logger.error("analysis", "Pipeline", "crash: <message>")`
- **AND** 若 `err.stack` 存在 SHALL 调用 `logger.error("analysis", "Pipeline", "stack:\n<stack>")`
#### Scenario: Web mode with no terminal

- **WHEN** `ProgressDisplay` 以 `{ disableTerminal: true }` 实例化
- **THEN** spinner SHALL NOT 启动
- **AND** `render()` SHALL 为 no-op

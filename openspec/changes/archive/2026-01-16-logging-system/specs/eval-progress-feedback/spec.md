## MODIFIED Requirements

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

### Requirement: Crash Error Logging

`runEval` 的 catch 块 SHALL 通过 Logger 写入完整错误信息到 `~/.dscode/logs/analysis.log`（使用 `Logger` 实例的 `error("analysis", "Pipeline", ...)`）。

若 `err` 为 `Error` 实例且包含 `stack`，SHALL 额外写入 `logger.error("analysis", "Pipeline", "stack:\n<stack>")`。

SHALL 仍然调用 `ui.addError(...)` 在 TUI 显示错误摘要。

#### Scenario: Pipeline crash logged to file

- **WHEN** `runCausalGraphPipeline` 或 `runFocusPipeline` 抛出异常
- **THEN** 系统 SHALL 调用 `logger.error("analysis", "Pipeline", "crash: <message>")`
- **AND** 若 `err.stack` 存在 SHALL 调用 `logger.error("analysis", "Pipeline", "stack:\n<stack>")`
- **AND** SHALL 仍然调用 `ui.addError(...)` 在 TUI 显示错误摘要

## REMOVED Requirements

### Requirement: ProgressDisplay Mode Decoupling

**Reason**: 合并到 `logging-system` 和 `chiff-progress-display` 的修改中。`disableTerminal` 选项不再需要——ANSI 终端渲染已被移除，`ProgressDisplay` 统一走 `onLog` + logger。

**Migration**: 移除 `ProgressDisplay` 构造函数的 `disableTerminal` 选项。`onLog` 和 `throttleMs` 选项保留。

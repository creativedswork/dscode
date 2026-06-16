## MODIFIED Requirements

### Requirement: Phase Progress Tracking

The system SHALL track the progress of each CHIFF phase and emit structured progress events.

Phases tracked:
- Phase 0/4: 落盘（library generation）
- Phase 1/4: SCAN（attention zone identification）
- Phase 2/4: ZOOM（per-zone causal analysis），含子 phase 列表（Z1, Z2, ...）
- Phase 3/4: SYNTHESIZE（cross-zone attribution）
- Phase 4/4: 生成报告（dashboard generation）

#### Scenario: Phase lifecycle

- **WHEN** a phase starts
- **THEN** the system SHALL emit a phase event with `status: "running"`
- **AND** when the phase completes, the system SHALL emit with `status: "done"` plus timing and stats
- **AND** phases not yet started SHALL show `status: "pending"`

#### Scenario: Phase completion with stats

- **WHEN** Pass 1 SCAN completes after 8 tool calls and 3.2 seconds
- **THEN** the phase event SHALL include `toolCalls: 8` and `durationMs: 3200`
- **AND** SHALL include a summary (e.g., "识别 3 个 attention zones: Z1, Z2, Z3")

## REMOVED Requirements

### Requirement: Terminal Progress Rendering

**Reason**: ANSI 终端渲染（`process.stdout.write`、`console.log` 进度条和完成框）与 TUI 显示冲突，且 web 模式下无终端可写。进度信息改为通过 `onLog` 回调（推 TUI 面板）和 `Logger("analysis")`（写文件）双通道输出。

**Migration**: 删除 `ProgressDisplay.render()`、`ProgressDisplay.renderCompletion()` 中的 `process.stdout.write` 和 `console.log` 调用。删除 spinner (`startSpinner`/`stopSpinner`)。进度追踪数据结构保留不变。

## ADDED Requirements

### Requirement: File-Based Progress Logging

`ProgressDisplay` SHALL 接受可选的 `logger: Logger` 参数，用于将进度事件写入日志文件。

`onPhaseStart`、`onPhaseDone`、`onPhaseProgress`、`showCompletion` SHALL 在 logger 可用时通过 `logger.info("analysis", tag, msg)` 写入对应事件。

#### Scenario: Phase start logged to file

- **WHEN** `ProgressDisplay` 以 `{ onLog, logger }` 实例化
- **AND** `onPhaseStart(0)` 被调用
- **THEN** logger SHALL 写入 `logger.info("analysis", "Phase0", "start")`

#### Scenario: Phase done logged to file

- **WHEN** `onPhaseDone(1, "识别到 3 个 attention zones", 3200)` 被调用
- **THEN** logger SHALL 写入 `logger.info("analysis", "Phase1", "done: 识别到 3 个 attention zones (3200ms)")`

#### Scenario: Completion logged to file

- **WHEN** `showCompletion({ totalDurationMs: 120000, totalLLMCalls: 8, keyFindings: "根因: ..." })` 被调用
- **THEN** logger SHALL 写入 `logger.info("analysis", "Complete", "120.0s · 8 LLM calls · 根因: ...")`

# chiff-progress-display Specification

## Purpose

CHIFF 进度展示系统。在终端会话窗口中实时展示三阶段 Agent 的执行进度——Phase 日志、tool call 计数和最近操作描述、进度百分比。

## ADDED Requirements

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


### Requirement: Web Progress Rendering

The system SHALL push progress events to the Web UI via WebSocket when running in web mode.

The Web UI SHALL render a progress panel that mirrors the terminal display but using HTML/CSS with:
- Animated progress bar
- Expandable phase log with per-phase details
- Auto-scroll to the currently running phase
- Color-coded status (green done / blue running / gray pending)

#### Scenario: Web progress update

- **WHEN** the system is in web mode and a progress event is emitted
- **THEN** the event SHALL be sent to the frontend via WebSocket
- **AND** the frontend SHALL update the progress panel without full page reload

### Requirement: Completion Summary

When all phases complete, the system SHALL display a summary showing:
- Total duration
- Total LLM calls (including tool calls across all Passes)
- Key findings: number of attention zones, root cause agent and step

#### Scenario: Completion summary after successful eval

- **WHEN** all 5 phases complete successfully
- **THEN** the terminal SHALL print a summary block with the total duration and call count
- **AND** SHALL print the root cause: "根因: write_file@Step 480 — hash ambiguity in edit"
- **AND** SHALL then proceed to open the dashboard


### Requirement: File-Based Progress Logging

`ProgressDisplay` SHALL 接受可选的 `logger: Logger` 参数，用于将进度事件写入日志文件。

`onPhaseStart`、`onPhaseDone`、`onPhaseProgress`、`showCompletion` SHALL 在 logger 可用时通过 `logger.info(tag, msg)` 写入对应事件。

#### Scenario: Phase start logged to file

- **WHEN** `ProgressDisplay` 以 `{ onLog, logger }` 实例化
- **AND** `onPhaseStart(0)` 被调用
- **THEN** logger SHALL 写入 `logger.info("Phase0", "start")`

#### Scenario: Phase done logged to file

- **WHEN** `onPhaseDone(1, "识别到 3 个 attention zones", 3200)` 被调用
- **THEN** logger SHALL 写入 `logger.info("Phase1", "done: 识别到 3 个 attention zones (3200ms)")`

#### Scenario: Completion logged to file

- **WHEN** `showCompletion({ totalDurationMs: 120000, totalLLMCalls: 8, keyFindings: "根因: ..." })` 被调用
- **THEN** logger SHALL 写入 `logger.info("Complete", "120.0s · 8 LLM calls · 根因: ...")`
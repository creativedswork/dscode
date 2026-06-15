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

### Requirement: Terminal Progress Rendering

The system SHALL render progress to the terminal using ANSI control codes for in-place updates.

The terminal display SHALL include:
1. A progress bar showing overall completion percentage
2. A phase log listing all phases with status icons (✓ done / ⠋ running / ⏳ pending)
3. For the currently running phase: tool call count and latest operation description
4. For ZOOM phase: per-zone status with individual tool call counts

#### Scenario: Scan phase in progress

- **WHEN** SCAN is running with 3 tool calls so far and the latest was `read_file("library/skeleton.md")`
- **THEN** the terminal SHALL show a spinner on the SCAN line
- **AND** SHALL display "· 已调用 3 次工具"
- **AND** SHALL display "· 最近: read_file(library/skeleton.md)"

#### Scenario: Zoom phase with multiple zones

- **WHEN** ZOOM is running with Zone Z1 active (4 tool calls), Zone Z2 pending
- **THEN** the terminal SHALL show a spinner on Z1
- **AND** SHALL show ⏳ on Z2
- **AND** each zone line SHALL show its own tool call count

#### Scenario: All phases complete

- **WHEN** all 5 phases are done
- **THEN** all phase lines SHALL show ✓
- **AND** the progress bar SHALL show 100%
- **AND** the system SHALL print a completion summary

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

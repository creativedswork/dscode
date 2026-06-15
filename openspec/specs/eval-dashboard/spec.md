# eval-dashboard Specification

## Purpose

Session quality diagnostic analysis for dscode. Analyzes sessions using a CHIFF causal graph pipeline (LLM-only, no deterministic fallback), and generates a dark-themed HTML dashboard with causal graph visualization, data flow paths, counterfactual reasoning chains, harness rules, rule trends, and recovery timeline.

## Requirements

### Requirement: /eval Slash Command

The system SHALL provide a `/eval` slash command that analyzes a session using the CHIFF causal graph pipeline and generates an HTML diagnostic dashboard. Analysis uses a CHIFF multi-step LLM architecture: 4 LLM calls build a causal graph (subtask decomposition → subtask edges → agent OTAR nodes → agent edges), then 2 LLM calls perform counterfactual attribution (candidate set → root cause via Rule1/2/3/4), followed by LLM rule attribution and semantic rule merge. Pure computational stats extraction runs first as Step 0. If any LLM call fails after retry, the system SHALL surface the error to the user rather than silently degrading.

During pipeline execution, the system SHALL output progress messages via `ui.addInfo`:
- Causal graph pipeline: one Phase-style message per step ("🔍 Phase N/6: ..." / "✓ Phase N/6 完成")
- Focus pipeline: Phase boundaries ("⏳ Phase N/4: ..." / "✓ ...") and throttled agent tool call progress ("  ⟳ ...")
- Final result summary with dashboard path and stats

On pipeline crash, the system SHALL write full error details (message + stack trace) to `~/.dscode/logs/eval.log` via `logEval("error", ...)` in addition to the existing `ui.addError` display.

When invoked without arguments, it SHALL analyze the current session. When invoked with a session ID or prefix (minimum 8 characters), it SHALL locate and analyze that session.

#### Scenario: Evaluate current session

- **WHEN** the user types `/eval` with no arguments and a current session exists
- **THEN** the system SHALL analyze the current session's data using the CHIFF pipeline
- **AND** generate an HTML dashboard at `~/.dscode/eval/{session_id_prefix}.html`
- **AND** automatically open the dashboard in the default browser
- **AND** display an info message with the dashboard file path

#### Scenario: Causal graph pipeline shows phase progress

- **WHEN** session has < 500 steps and causal graph pipeline runs
- **THEN** the system SHALL output "🔍 Phase 1/6: 分解子任务..." through "✓ Phase 6/6 完成" as info messages
- **AND** each message SHALL appear before/after its corresponding LLM call

#### Scenario: Focus pipeline shows phase and tool progress

- **WHEN** session has ≥ 500 steps and focus pipeline runs
- **THEN** the system SHALL output phase boundary messages ("🔍 SCAN: 正在扫描...", "✓ ...")
- **AND** SHALL output throttled tool call progress during agent loops ("  ⟳ <tool action>")

#### Scenario: Pipeline crash logged to eval.log

- **WHEN** any pipeline step throws an error
- **THEN** `logEval("error", "Pipeline", "crash: ...")` SHALL be called
- **AND** if stack trace exists, `logEval("error", "Pipeline", "stack:\n...")` SHALL be called
- **AND** `ui.addError(...)` SHALL still display the error message in TUI

#### Scenario: Evaluate session by full ID

- **WHEN** the user types `/eval 00MPX37L8RW7I64DNM725JX5MK` (a valid full session ID)
- **THEN** the system SHALL locate the session file by exact ID match
- **AND** analyze it and generate the dashboard

#### Scenario: Evaluate session by prefix

- **WHEN** the user types `/eval 00MPX37L8` (at least 8 characters matching a session ID prefix)
- **THEN** the system SHALL match the session by prefix
- **AND** analyze it and generate the dashboard

#### Scenario: Session not found

- **WHEN** the user types `/eval` with an invalid or non-existent session ID
- **THEN** the system SHALL display an error message: "Session not found: {id}"
- **AND** NOT generate any dashboard file

#### Scenario: No current session and no argument

- **WHEN** the user types `/eval` with no arguments and there is no current session
- **THEN** the system SHALL display an error message: "No session to evaluate. Usage: /eval [session_id]"

#### Scenario: LLM pipeline fails

- **WHEN** any LLM step in the CHIFF pipeline fails after retry
- **THEN** the system SHALL display an error message: "eval: CHIFF pipeline failed at Step {N}: {error_message}"
- **AND** NOT generate a dashboard

### Requirement: Hybrid Analysis Architecture

The analysis SHALL use a LLM-only causal-graph architecture based on CHIFF methodology. There is no fallback to deterministic analysis.

**Step 0 — Stats Computation** (`computeStats()`): Deterministic, pure computation. Extracts metadata and tool call statistics from `SerializedSession`. No inference, no heuristics.

**Step 1-4 — Causal Graph Construction** (4 LLM calls): Builds a structured causal graph — subtask decomposition with phase status (Step 1), subtask edges with data transfer and failure modes (Step 2), agent nodes with OTAR quadruples and step-level data flows (Step 3), agent-to-agent edges with failure modes (Step 4). Graph assembly is deterministic (`CausalGraphStore`). If the graph is incomplete (`isGraphComplete() === false`), the system SHALL throw an error.

**Step 5-6 — Counterfactual Attribution** (2 LLM calls): Generates candidate error set with deviation descriptions (≥5 steps, Step 5) and performs single root-cause attribution with root cause title and severity using four counterfactual rules (Step 6).

**Step 7-8 — Rule Pipeline**: LLM rule attribution (Step 7) and LLM semantic rule merge (Step 8).

#### Scenario: LLM causal-graph analysis succeeds

- **WHEN** all LLM steps complete successfully and the causal graph is built
- **THEN** phases SHALL be derived from Step 1 subtask decomposition
- **AND** deviations SHALL be derived from Step 5 candidate error set
- **AND** rootCauses SHALL be derived from Step 6 attribution
- **AND** the dashboard SHALL display causal graph visualization, data flow paths, and rule reasoning chain

#### Scenario: LLM analysis fails at any step

- **WHEN** any of Step 1-6 LLM calls fail and retry is exhausted
- **THEN** the system SHALL surface the error to the user
- **AND** NOT generate a dashboard

### Requirement: Session Message Format Recognition

The analysis engine SHALL correctly parse dscode's actual session message format:

- Tool call messages: `role: "assistant"`, content blocks with `type: "toolCall"`, `name: string`, `arguments: object`
- Tool result messages: `role: "toolResult"`, `toolName: string`, `isError: boolean`, `details.error: string | undefined`
- Thinking: inside content blocks with `type: "thinking"` and `thinking: string` field, or top-level `msg.thinking` field
- User messages: `role: "user"`, content blocks with `type: "text"`

#### Scenario: Tool calls correctly counted

- **WHEN** a session contains messages with `type: "toolCall"` content blocks
- **THEN** the system SHALL detect and count them via `getToolCallNames()`
- **AND** extract tool names from `block.name`

#### Scenario: Tool errors correctly detected

- **WHEN** a `toolResult` message has `isError: true` or `details.error` is present
- **THEN** `isToolResultError()` SHALL return true

### Requirement: Session Metadata Extraction

The analysis engine SHALL extract the following metadata from a SerializedSession: session ID, title, model name (provider/modelId), total message count, time span (from createdAt to updatedAt), project path, startedAt, and endedAt. Timestamps SHALL be formatted as "YYYY-MM-DD HH:mm:ss". Duration SHALL be formatted as "Xh Ym" or "< 1m". Null/NaN timestamps SHALL produce "unknown".

#### Scenario: Metadata extraction from valid session

- **WHEN** a SerializedSession with version 1 or 2 is loaded
- **THEN** the system SHALL extract sessionId, title, model, totalMessages, duration, projectPath, startedAt, endedAt
- **AND** all metadata fields SHALL be displayed in the dashboard header

### Requirement: Tool Call Statistics

The analysis engine SHALL count and categorize all tool calls in the session: total tool calls (from `toolCall` blocks), tool errors (from `toolResult` messages with `isError: true` or `details.error`), error rate as a percentage string ("XX.X%"), screenshots taken (tool names matching "screenshot"), and user complaint messages count (matching Chinese complaint patterns like /不对/, /错了/, /不要/).

#### Scenario: Tool call statistics with mixed success/failure

- **WHEN** a session contains 52 tool calls with 10 errors
- **THEN** the system SHALL report total: 52, errors: 10, error rate: "19.2%"
- **AND** display these as summary cards in the dashboard

### Requirement: Phase Auto-Detection

The analysis engine SHALL derive phases exclusively from Step 1 subtask decomposition. Each subtask produced by the LLM SHALL include a `phaseStatus` field ("ok" | "warn" | "danger") based on the presence of tool errors, user frustration, or creative drift within the subtask's step range. Each phase SHALL have a label (subtask name), message range [stepStart, stepEnd], status, a summary description (oracle goal), and a breakdown of tool calls within the phase (derived from AgentNodes in that subtask).

#### Scenario: Phases mapped from subtasks

- **WHEN** Step 1 produced subtasks S1("Initial exploration"), S2("Implementation"), S3("User correction"), S4("Polish")
- **THEN** the phase timeline SHALL show these 4 phases with correct step ranges
- **AND** status SHALL be "danger" for S3 (contains user complaint)
- **AND** status SHALL be "ok" for S1 and S4 (no errors or complaints)

### Requirement: Keyword Deviation Detection

The analysis engine SHALL derive deviation points exclusively from Step 5 candidate error set. Each candidate step with `impactScore > 0.3` SHALL be rendered as a deviation point in the dashboard with its `deviationDescription`. The system SHALL NOT compute keyword overlap, Jaccard distance, or maintain any visual keyword whitelist.

#### Scenario: Deviations derived from candidate set

- **WHEN** Step 5 produces 7 candidate error steps with impact scores ranging from 0.2 to 0.9
- **THEN** the dashboard SHALL display deviations for candidates with impactScore > 0.3
- **AND** each deviation SHALL show the LLM-generated `deviationDescription`
- **AND** severity SHALL map from impactScore (high > 0.7, medium > 0.4, low ≤ 0.4)

### Requirement: Root Cause Inference

The analysis engine SHALL derive root causes exclusively from Step 6 counterfactual attribution. The LLM-produced `Attribution` SHALL include `rootCauseTitle` and `rootCauseSeverity`. There SHALL be exactly one root cause — the single attribution from Step 6. Secondary root causes are no longer generated.

#### Scenario: Single root cause from Step 6

- **WHEN** Step 6 attributes root cause to `write_file` at step 18 with rules ["Rule2", "Rule3"]
- **THEN** the dashboard SHALL display exactly one root cause with the Step 6 title and reasoning
- **AND** severity SHALL be "primary"

### Requirement: Recovery Timeline Section

When `EvalResult.recoveryArcs` is present and non-empty, the dashboard SHALL render a "Recovery Timeline" (恢复时间线) section between the Causal Graph and Rule Reasoning Chain sections.

Each `RecoveryArc` SHALL be rendered as a horizontal timeline row showing the error→detection→correction progression with color-coded segments:
- **Red** segment: Error event (errorStep, errorAgent, errorSummary)
- **Yellow** segment: Detection event (detectionStep, detectionType)
- **Green** segment: Correction event (correctionStep, correctionAgent, correctionSummary, effective status)

Each timeline row SHALL display: the recovery arc sequence, error summary, detection type label, correction summary, steps-to-recover count, misdiagnosis count (if > 0), effectiveness indicator (✅/⚠️), and `rootCauseHypothesis` as a 💡 insight callout.

#### Scenario: Dashboard with recovery arcs

- **WHEN** a session analysis produces 2 recovery arcs
- **THEN** the dashboard SHALL display a "Recovery Timeline" section with two timeline rows
- **AND** each row SHALL use red/yellow/green color coding
- **AND** each row SHALL display the `rootCauseHypothesis` below the timeline

#### Scenario: Dashboard without recovery arcs

- **WHEN** `EvalResult.recoveryArcs` is undefined or empty
- **THEN** the dashboard SHALL NOT render the Recovery Timeline section

#### Scenario: Recovery arc with misdiagnosis

- **WHEN** a recovery arc has `misdiagnosisCount: 2`
- **THEN** the timeline row SHALL display "2 次误判" in a warning style

### Requirement: Recovery Arc Styling

The recovery timeline SHALL use inline styles compatible with the dark theme. Color scheme:
- Error (red): `#f85149` background, white text
- Detection (yellow): `#d2991d` background, dark text
- Correction effective (green): `#3fb950` background, dark text
- Correction ineffective (muted): `rgba(210,153,29,0.3)` background
- Container: `#161b22` background, `#30363d` border, 6px border-radius

#### Scenario: Recovery timeline matches dashboard theme

- **WHEN** the recovery timeline is rendered
- **THEN** all colors SHALL come from the existing COLORS constant
- **AND** no external CSS files SHALL be referenced

### Requirement: Dashboard HTML Generation

The system SHALL generate a self-contained HTML file at `~/.dscode/eval/{session_id_prefix}.html` with dark theme, inline CSS, and no external dependencies. The dashboard SHALL contain: header with metadata, summary stat cards (message count, tool calls, error rate, screenshots, triggered rules count) with color coding (ok=#3fb950, warn=#d2991d, danger=#f85149), phase timeline with horizontal colored bars, causal graph visualization section, data flow paths section, Rule reasoning chain section (Rule1/2/3/4 application with evidence), Harness Rules section (grouped by category, with severity badges and expandable suggestions), Rule Trends section, root cause analysis section, deviations section, recovery timeline section, and event timeline.

All sections SHALL render unconditionally — there is no rule-engine mode to conditionally hide content.

#### Scenario: Complete dashboard with all sections

- **WHEN** a session analysis completes successfully
- **THEN** the generated HTML SHALL include all sections (causal graph, data flow, rule chain, harness rules, rule trends, root cause, deviations, recovery timeline, timeline)
- **AND** the header SHALL NOT display an analysis mode badge

#### Scenario: Dashboard with no triggered rules

- **WHEN** a session analysis produces zero harness rules
- **THEN** the Harness Rules section SHALL display "未检测到 Agent 配置问题"
- **AND** the Triggered Rules stat card SHALL show 0

#### Scenario: HTML output is safe

- **WHEN** the session contains user messages with HTML special characters
- **THEN** `escapeHtml()` SHALL escape all text and return "" for null/undefined inputs

### Requirement: Causal Graph Visualization

When `causalGraph` is present, the dashboard SHALL render a visualization showing:
- Subtask nodes as colored horizontal bars with name and step range, color-coded by status (green=ok, yellow=warn, red=danger)
- Subtask edges as labeled dependency lines
- Agent counts and key actions per subtask

The visualization SHALL use inline styles compatible with the dark theme and be responsive within the dashboard container.

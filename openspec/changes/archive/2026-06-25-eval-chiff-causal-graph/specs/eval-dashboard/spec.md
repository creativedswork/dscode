# eval-dashboard Specification (Delta)

## MODIFIED Requirements

### Requirement: Hybrid Analysis Architecture

The analysis SHALL use a multi-step causal-graph architecture based on CHIFF methodology:

**Step 0 — Session Parser** (`parseSessionToSteps()`): Deterministic. Parses `SerializedSession` into `HistoryStep[]` (stepId, agent, observation, thought, action, result, isError, timestamp). Extracts metadata and computes tool call statistics.

**Step 1-4 — Causal Graph Construction** (4 LLM calls): Builds a structured causal graph — subtask decomposition (Step 1), subtask edges with data transfer and failure modes (Step 2), agent nodes with OTAR quadruples and step-level data flows (Step 3), agent-to-agent edges with failure modes (Step 4). Graph assembly is deterministic (`CausalGraphStore`). If the graph is incomplete (`isGraphComplete() === false`), the system SHALL fall back to rule-engine analysis.

**Step 5-6 — Counterfactual Attribution** (2 LLM calls): Generates candidate error set (≥5 steps, Step 5) and performs single root-cause attribution using three counterfactual rules: Rule1 (control flow / loop adjudication), Rule2 (data flow traceback), Rule3 (irrecoverable point identification) (Step 6).

**Fallback**: If any LLM call fails (network error, timeout, JSON parse failure after retry), the system returns pure rule-engine results. The dashboard displays `analysisMode: "rule"` with a visible indicator.

#### Scenario: LLM causal-graph analysis succeeds

- **WHEN** all 6 steps complete successfully and the causal graph is built
- **THEN** phases SHALL be derived from subtask decomposition
- **AND** rootCauses SHALL include the Step 6 attribution with rules_applied
- **AND** `analysisMode` SHALL be set to `"llm"`
- **AND** the dashboard SHALL display causal graph visualization

#### Scenario: LLM analysis fails at any step

- **WHEN** any of Step 1-6 LLM calls fail and retry is exhausted
- **THEN** the system SHALL return pure rule-engine results
- **AND** `analysisMode` SHALL be set to `"rule"`
- **AND** the dashboard SHALL display "⚙ 规则引擎分析（LLM 不可用）"

### Requirement: Dashboard HTML Generation

The system SHALL generate a self-contained HTML file at `~/.dscode/eval/{session_id_prefix}.html` with dark theme, inline CSS, and no external dependencies. The dashboard SHALL contain: header with metadata and analysis mode badge, summary stat cards, **causal graph visualization section** (SVG diagram showing subtask→subtask and agent→agent dependency graph with color-coded nodes), **data flow paths section** (table showing key data items and their complete production→consumption chains), **Rule reasoning chain section** (collapsible display of Rule1/2/3 application with evidence), phase timeline from subtask decomposition, root cause analysis section with final attribution, deviations section, suggestions section, and event timeline.

#### Scenario: Dashboard with causal graph

- **WHEN** a session analysis completes with a full causal graph (LLM mode)
- **THEN** the generated HTML SHALL include an SVG causal graph visualization
- **AND** SHALL include a data flow paths table
- **AND** SHALL include a Rule reasoning chain section

#### Scenario: Dashboard in rule-engine fallback mode

- **WHEN** the causal graph could not be built and rule engine was used
- **THEN** the dashboard SHALL omit the causal graph, data flow paths, and Rule reasoning chain sections
- **AND** SHALL display the rule-engine analysis flag

#### Scenario: HTML output is safe

- **WHEN** the session contains user messages with HTML special characters
- **THEN** `escapeHtml()` SHALL escape all text and return "" for null/undefined inputs

### Requirement: Eval Result Data Structure

The analysis engine SHALL return an `EvalResult` object with fields: `metadata` (SessionMeta), `stats` (ToolStats), `phases` (PhaseInfo[]), `deviations` (DeviationPoint[]), `rootCauses` (RootCause[]), `suggestions` (string[]), `timeline` (TimelineEvent[]), `analysisMode` ("llm" | "rule"), `causalGraph` (CausalGraphSnapshot | null — present only in LLM mode), `attribution` (Attribution | null — present only in LLM mode), and `rulesApplied` (string[] — Rule1/2/3 identifiers, present only in LLM mode).

#### Scenario: Complete EvalResult after LLM causal-graph analysis

- **WHEN** the full 6-step pipeline completes successfully
- **THEN** `analysisMode` SHALL be "llm"
- **AND** `causalGraph` SHALL be non-null containing subtask, edge, agent, and dataflow summaries
- **AND** `attribution` SHALL be non-null with mistake_agent, mistake_step, reason, rules_applied
- **AND** `rulesApplied` SHALL be a non-empty array

#### Scenario: EvalResult after rule-engine fallback

- **WHEN** LLM analysis fails and rule engine is used
- **THEN** `analysisMode` SHALL be "rule"
- **AND** `causalGraph` SHALL be null
- **AND** `attribution` SHALL be null
- **AND** `rulesApplied` SHALL be an empty array

## ADDED Requirements

### Requirement: Causal Graph SVG Visualization

When `analysisMode` is "llm" and `causalGraph` is present, the dashboard SHALL render an SVG diagram showing:
- Subtask nodes as rounded rectangles with name and step range, color-coded by status (green=ok, yellow=warn, red=danger)
- Subtask edges as directed arrows labeled with dependency type
- Agent nodes within each subtask as smaller rectangles
- Agent edges as dashed arrows within subtask boundaries

The SVG SHALL use inline styles compatible with the dark theme and be responsive within the dashboard container.

#### Scenario: Causal graph rendered for multi-subtask session

- **WHEN** the causal graph has 3+ subtasks with edges and agent nodes
- **THEN** the SVG SHALL display all subtasks with correct step ranges
- **AND** edges SHALL be labeled with dependency type
- **AND** all text SHALL be legible at dashboard width (max 1200px)

### Requirement: Data Flow Paths Table

When `causalGraph` is present, the dashboard SHALL render a table showing key data items and their complete flow paths. Each row SHALL display: data_item name, producer step (agent + stepId), consumer steps (agent + stepId for each), correctness assessment, and a visual indicator (checkmark for correct, warning for issues).

#### Scenario: Data flow table for session with file operations

- **WHEN** the causal graph contains data flows tracking file reads and writes
- **THEN** each tracked file SHALL appear as a row in the data flow table
- **AND** the complete chain from first read to last write SHALL be visible

### Requirement: Rule Reasoning Chain Display

When `attribution` and `rulesApplied` are present, the dashboard SHALL display a collapsible reasoning chain section showing:
- Step 5 candidate set summary (top candidates ranked by impact)
- Step 6 final attribution with Rule1/2/3 application details
- Evidence for each rule (message indices, data items, loop groups referenced)

The reasoning chain SHALL use a vertical timeline layout with color-coded rule labels.

#### Scenario: Rule reasoning chain for a Rule2 attribution

- **WHEN** the root cause was attributed via Rule 2 (data flow)
- **THEN** the reasoning chain SHALL show: the data item traced, its source step, its consumption step, and why the consumer was at fault
- **AND** Rule2 SHALL be highlighted as the primary rule

### Requirement: Phase Timeline from Subtasks

When LLM analysis is used, the phase timeline SHALL be derived from subtask decomposition (Step 1) rather than regex-based intent signals. Each subtask SHALL produce one phase with: label from subtask name, startIdx from subtask step_start, endIdx from subtask step_end, status derived from whether the subtask contains errors or deviations, and summary from the oracle goal.

#### Scenario: Phases mapped from subtasks

- **WHEN** Step 1 produced subtasks S1("探索"), S2("实现"), S3("修复"), S4("调整")
- **THEN** the phase timeline SHALL show these 4 phases with correct step ranges
- **AND** status SHALL be "danger" for subtasks containing user complaints or tool errors

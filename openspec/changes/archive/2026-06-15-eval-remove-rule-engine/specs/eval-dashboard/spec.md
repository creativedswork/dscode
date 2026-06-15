## MODIFIED Requirements

### Requirement: /eval Slash Command

The system SHALL provide a `/eval` slash command that analyzes a session using the CHIFF causal graph pipeline and generates an HTML diagnostic dashboard. Analysis uses a CHIFF multi-step LLM architecture: 4 LLM calls build a causal graph (subtask decomposition → subtask edges → agent OTAR nodes → agent edges), then 2 LLM calls perform counterfactual attribution (candidate set → root cause via Rule1/2/3/4), followed by LLM rule attribution and semantic rule merge. Pure computational stats extraction runs first as Step 0. If any LLM call fails after retry, the system SHALL surface the error to the user rather than silently degrading to lower-quality analysis.

When invoked without arguments, it SHALL analyze the current session. When invoked with a session ID or prefix (minimum 8 characters), it SHALL locate and analyze that session.

#### Scenario: Evaluate current session

- **WHEN** the user types `/eval` with no arguments and a current session exists
- **THEN** the system SHALL analyze the current session's data using the CHIFF pipeline
- **AND** generate an HTML dashboard at `~/.dscode/eval/{session_id_prefix}.html`
- **AND** automatically open the dashboard in the default browser
- **AND** display an info message with the dashboard file path

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

The analysis engine SHALL derive root causes exclusively from Step 6 counterfactual attribution. The LLM-produced `Attribution` SHALL include `rootCauseTitle` and `rootCauseSeverity`. There SHALL be exactly one root cause — the single attribution from Step 6. Secondary root causes (previously from `inferRootCauses()`) are no longer generated.

#### Scenario: Single root cause from Step 6

- **WHEN** Step 6 attributes root cause to `write_file` at step 18 with rules ["Rule2", "Rule3"]
- **THEN** the dashboard SHALL display exactly one root cause with the Step 6 title and reasoning
- **AND** severity SHALL be "primary"

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

## REMOVED Requirements

### Requirement: Hybrid Analysis Architecture rule-engine sections

**Reason**: The rule-engine fallback mode is removed. Steps 7-8 are no longer deterministic (they use LLM for rule attribution and semantic merge). The fallback text "If any LLM call fails... the system returns pure rule-engine results" no longer applies.

**Migration**: Remove `analysisMode` field from `EvalResult`. Remove all conditional rendering based on analysis mode from dashboard. Steps 7-8 use LLM (already the case in current implementation).

### Requirement: Sessions without phases or with single phase

**Reason**: The scenario describing rule-engine mode producing a single "Full Session" phase is no longer applicable. LLM subtask decomposition always produces meaningful phases.

**Migration**: No code changes needed. LLM subtask decomposition naturally avoids the "single phase" degenerate case.

### Requirement: Rule-engine specific root cause patterns

**Reason**: The patterns "效果过载", "截图感知盲区", "需求蔓延 (Scope Creep)", and "修复连锁反应 (Fix Cascade)" were generated by `inferRootCauses()` which is deleted. These patterns are now identified by the LLM during Step 5/6 as part of candidate error and attribution.

**Migration**: No code changes needed — LLM identifies these patterns naturally and with richer context than hardcoded heuristics.

### Requirement: Dashboard in rule-engine fallback mode

**Reason**: The rule-engine fallback mode no longer exists. There is no scenario where the dashboard omits causal graph, data flow paths, or rule reasoning chain sections.

**Migration**: Remove the `analysisMode` badge from the dashboard header. All sections render unconditionally.

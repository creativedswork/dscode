# eval-dashboard Specification

## Purpose

Session quality diagnostic analysis for dscode. Analyzes sessions using a CHIFF causal graph pipeline (LLM-only, no deterministic fallback), and generates a dark-themed HTML dashboard with causal graph visualization, data flow paths, counterfactual reasoning chains, harness rules, rule trends, and recovery timeline.
## Requirements
### Requirement: /eval Slash Command

The system SHALL provide `/eval [session_id]` to analyze a target Session with the unified CHIEF Multi-Agent Pipeline and generate a self-contained diagnostic Dashboard. Without an argument it SHALL evaluate a frozen snapshot of the current Session; with an exact ID or valid prefix it SHALL load the persisted target Session.

The command SHALL:

1. Resolve and freeze the target Session before spawning workers.
2. Load only target task SubAgents indexed by `agentMessages`.
3. Prepare a run-isolated workspace and Multi-Agent Trajectory.
4. Execute all LLM stages through process-only AgentSupervisor workers.
5. Generate the Dashboard only after required stages pass validation.
6. Preserve the latest successful Dashboard if the new run fails.
7. Publish typed starting/running/completed/failed Eval Dashboard lifecycle events.
8. Delegate final presentation to the active UI backend through shared Harness events.

During execution, phase boundaries SHALL be reported through UI info/progress events, workers SHALL appear through shared Agent Activity, and Eval Dashboard lifecycle events SHALL carry run/target identity. Errors SHALL be written to the eval Logger with run/stage context and surfaced concisely to the user.

After success, TUI SHALL open the compatibility Dashboard file in the system browser. WebUI SHALL render the exact generated HTML in its dedicated Eval view and SHALL NOT automatically open an additional external browser window.

#### Scenario: WebUI command immediately enters Eval mode

- **WHEN** WebUI submits `/eval` through its prompt
- **THEN** the slash-command path SHALL publish `starting` before the first asynchronous target load
- **AND** WebUI SHALL switch to its Eval preparation view immediately
- **AND** subsequent CHIEF progress SHALL update that view instead of behaving as command-line-only text output

#### Scenario: Evaluate current Multi-Agent Session from TUI

- **WHEN** the user runs `/eval` in TUI and the current Session has three task SubAgents
- **THEN** the command SHALL analyze Main and all three indexed SubAgents
- **AND** SHALL run CHIEF workers through AgentSupervisor
- **AND** SHALL generate `~/.dscode/eval/<session-prefix>.html`
- **AND** TUI SHALL open the completed Dashboard in the system browser

#### Scenario: Evaluate current Multi-Agent Session from WebUI

- **WHEN** the user runs `/eval` in WebUI and the current Session has task SubAgents
- **THEN** the command SHALL generate the same run-local and compatibility HTML files
- **AND** WebUI SHALL receive the completed HTML through a typed Eval Dashboard event
- **AND** WebUI SHALL render the report in its Eval view
- **AND** the server SHALL NOT automatically open an additional external browser window

#### Scenario: Evaluate historical Session

- **WHEN** Session B is current and the user runs `/eval A`
- **THEN** target data SHALL come from persisted Session A
- **AND** live worker activity SHALL be routed to B
- **AND** Eval Dashboard events SHALL identify A as the target
- **AND** neither A nor B SHALL receive process-only worker summaries in `agentMessages`

#### Scenario: Session not found

- **WHEN** the provided Session ID or prefix cannot be resolved
- **THEN** the UI SHALL display `Session not found: <id>`
- **AND** no eval worker SHALL spawn
- **AND** no Dashboard SHALL be generated

#### Scenario: No current Session

- **WHEN** `/eval` has no argument and no current Session exists
- **THEN** the UI SHALL display `No session to evaluate. Usage: /eval [session_id]`

#### Scenario: Worker stage fails

- **WHEN** a required CHIEF stage fails after its validation retry
- **THEN** the UI SHALL identify the failed stage
- **AND** a failed Eval Dashboard event SHALL include the run/target identity and escaped error summary
- **AND** the run manifest/log SHALL retain diagnostics
- **AND** the latest successful Dashboard for the same target Session SHALL not be overwritten or presented as the failed run
- **AND** a Dashboard from another target Session SHALL NOT be used as failure fallback

### Requirement: Hybrid Analysis Architecture

The analysis SHALL use one unified CHIEF architecture for every Session size:

- deterministic trajectory aggregation, stats, workspace writing, graph reference validation, and Dashboard generation
- Supervisor-backed Agent workers for graph construction, Virtual Oracle synthesis, hierarchical backtracking, counterfactual attribution, Harness Rule attribution, and semantic merge

The architecture SHALL NOT route by Step-count into completion and Focus semantics. It SHALL adapt large inputs through deterministic chunking and selective workspace reads while preserving the same stage/output contracts.

#### Scenario: Small and large Sessions use equivalent stages

- **WHEN** one Session has 100 Steps and another has 900 Steps
- **THEN** both SHALL execute the same ordered CHIEF stages
- **AND** both SHALL produce the same result schema
- **AND** only their workspace chunk count/read pattern MAY differ

#### Scenario: No direct eval model call

- **WHEN** `/eval` executes any inference stage
- **THEN** the inference SHALL belong to an Agent Process in AgentSupervisor
- **AND** eval pipeline modules SHALL not call the model completion API directly

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

The analysis SHALL derive exactly one root cause from the CHIEF attribution worker after Oracle-guided hierarchical backtracking.

The root cause SHALL include real Agent ID, Application, role, Step ID when available, granularity, confidence, evidence quality, explanation, and the progressive screening stages used. Tools SHALL appear as Action evidence and SHALL not be displayed as the responsible Agent.

#### Scenario: Full SubAgent Step attribution

- **WHEN** Explorer Agent X first corrupts valid data at Step 18
- **THEN** the Dashboard SHALL identify Explorer and X's 6-character short ID
- **AND** SHALL identify Step 18 and its tool Action
- **AND** SHALL not label the tool itself as root-cause Agent

#### Scenario: Main Agent attribution

- **WHEN** Planning-Control Attribution determines Main repeatedly issued an unchanged failed plan
- **THEN** the Dashboard SHALL identify Main as the responsible Application/role
- **AND** SHALL show the responsible Main Step

#### Scenario: Agent-level partial attribution

- **WHEN** the responsible Agent has summary-only evidence
- **THEN** the Dashboard SHALL show Agent-level granularity and no fabricated Step
- **AND** SHALL display partial evidence and reduced confidence

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

The system SHALL generate a self-contained HTML Dashboard with inline CSS/JavaScript and no external runtime dependencies. It SHALL preserve existing metadata, stats, phase/subtask timeline, causal graph, data-flow paths, Recovery Timeline, Harness Rules, Rule Trends, root cause, deviations, and event timeline.

The Dashboard SHALL additionally contain:

- Agent/Application/process statistics and transcript completeness
- Agent Process Lanes for Main and SubAgents
- cross-Agent control/data propagation
- Subtask → Agent → Step backtracking candidates
- root-cause Application, 6-character Agent ID, Step/Agent granularity, confidence, and screening evidence
- explicit summary-only/missing transcript warnings

All Session-derived and model-derived text SHALL be HTML-escaped. Agent IDs stored in page data SHALL not be truncated internally, while visible IDs SHALL use the shared short-ID formatter.

#### Scenario: Complete Multi-Agent Dashboard

- **WHEN** analysis has full transcripts for Main and three SubAgents
- **THEN** the Summary SHALL show four Agents and complete evidence
- **AND** Process Lanes SHALL include all four actors
- **AND** root-cause and causal-path nodes SHALL use real Actor identities

#### Scenario: Missing transcript Dashboard

- **WHEN** one indexed SubAgent transcript is missing
- **THEN** the Dashboard SHALL identify the affected Application/Agent
- **AND** SHALL show full/summary/missing counts
- **AND** SHALL explain the effect on granularity/confidence

#### Scenario: Main-only Dashboard

- **WHEN** a Session contains no SubAgents
- **THEN** the Dashboard SHALL render Main-only Process state without an error
- **AND** Multi-Agent sections SHALL present a clear Main-only empty state

#### Scenario: HTML output is safe

- **WHEN** any Main/SubAgent content contains HTML special characters or script text
- **THEN** the Dashboard SHALL render it as escaped text
- **AND** SHALL not execute Session content

### Requirement: Causal Graph Visualization

The Dashboard SHALL visualize hierarchical Subtask nodes, real Agent process nodes, and Step/data edges. Agent nodes SHALL be keyed by Agent ID, labeled by Application and short ID, and visually distinguish Main from SubAgent roles.

The visualization SHALL differentiate control edges, result-return edges, data edges, root-cause path, and recovered/reversible paths. Two processes using the same Application MUST remain separate nodes.

#### Scenario: Two Explorer processes

- **WHEN** two Explorer Agents participate in one Session
- **THEN** the graph SHALL render two distinct Agent nodes with different short IDs
- **AND** each node SHALL connect only to its own Steps and causal edges

#### Scenario: Cross-Agent propagation

- **WHEN** Explorer output contaminates a later Main decision that Reviewer repairs
- **THEN** the graph SHALL show Explorer → Main → Reviewer propagation
- **AND** SHALL visually distinguish root-cause, propagated symptom, and recovery

### Requirement: Agent Process Lanes

The Dashboard SHALL render a stable lane per actor over global CHIEF Step IDs. Each lane SHALL show Application, role, short Agent ID, active range, terminal state, and duration when known.

Lane placement SHALL use stable Step ordering, while dependency arrows SHALL use trajectory edges rather than visual overlap.

#### Scenario: Parallel process lanes

- **WHEN** two SubAgents execute concurrently
- **THEN** their lane ranges MAY overlap
- **AND** the Dashboard SHALL not imply a direct dependency without an explicit edge

### Requirement: Hierarchical Backtracking Display

The Dashboard SHALL expose the candidate sets selected at Subtask, Agent, and Step levels and SHALL show how each level pruned the next.

#### Scenario: Candidate pruning

- **WHEN** backtracking selects 2 of 6 Subtasks, 2 of 4 Actors in those Subtasks, and 3 Steps
- **THEN** the Dashboard SHALL show `2/6`, `2/4`, and `3` at the corresponding levels
- **AND** users SHALL be able to associate each Step candidate with its Agent

### Requirement: Evidence Quality Display

The Dashboard SHALL display overall transcript completeness and per-Actor evidence quality. Partial evidence SHALL remain visible next to the attribution rather than only in logs.

#### Scenario: Complete evidence

- **WHEN** all indexed task SubAgents have full transcripts
- **THEN** evidence status SHALL be `complete`

#### Scenario: Partial evidence

- **WHEN** at least one Actor is summary-only or missing
- **THEN** evidence status SHALL be `partial`
- **AND** the warning SHALL identify affected Actors

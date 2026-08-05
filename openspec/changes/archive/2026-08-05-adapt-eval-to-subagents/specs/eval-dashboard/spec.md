## MODIFIED Requirements

### Requirement: /eval Slash Command

The system SHALL provide `/eval [session_id]` to analyze a target Session with the unified CHIEF Multi-Agent Pipeline and generate a self-contained diagnostic Dashboard. Without an argument it SHALL evaluate a frozen snapshot of the current Session; with an exact ID or valid prefix it SHALL load the persisted target Session.

The command SHALL:

1. Resolve and freeze the target Session before spawning workers.
2. Load only target task SubAgents indexed by `agentMessages`.
3. Prepare a run-isolated workspace and Multi-Agent Trajectory.
4. Execute all LLM stages through process-only AgentSupervisor workers.
5. Generate and open the Dashboard only after required stages pass validation.
6. Preserve the latest successful Dashboard if the new run fails.

During execution, phase boundaries SHALL be reported via UI info/progress events and workers SHALL appear through shared Agent Activity. Errors SHALL be written to the eval Logger with run/stage context and surfaced concisely to the user.

#### Scenario: Evaluate current Multi-Agent Session

- **WHEN** the user runs `/eval` and the current Session has three task SubAgents
- **THEN** the command SHALL analyze Main and all three indexed SubAgents
- **AND** SHALL run CHIEF workers through AgentSupervisor
- **AND** SHALL generate `~/.dscode/eval/<session-prefix>.html`
- **AND** SHALL open the completed Dashboard

#### Scenario: Evaluate historical Session

- **WHEN** Session B is current and the user runs `/eval A`
- **THEN** target data SHALL come from persisted Session A
- **AND** live worker activity SHALL be routed to B
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
- **AND** the run manifest/log SHALL retain diagnostics
- **AND** the latest successful Dashboard SHALL not be overwritten or opened as if current

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

## ADDED Requirements

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

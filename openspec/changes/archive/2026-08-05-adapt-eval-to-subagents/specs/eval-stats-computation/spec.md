## MODIFIED Requirements

### Requirement: Pure computational stats extraction

The system SHALL provide a pure `computeStats()` function that extracts metadata, tool statistics, and Agent execution statistics from a normalized `MultiAgentTrajectory` without inference, heuristics, pattern matching, or I/O.

The result SHALL include:

- `SessionMeta`: target Session ID, title, model, Main message count, duration, project path, start/end time
- `ToolStats`: tool calls/errors across full Main and SubAgent transcripts, error rate, screenshots, user complaints fixed at 0
- `AgentStats`: total actors, SubAgent count, unique Application count, completed/failed/terminated/killed counts, process success rate, full/summary/missing transcript counts

Summary-only actors SHALL contribute to Agent lifecycle counts but SHALL not invent tool calls. Main and SubAgent tool calls SHALL each be counted exactly once.

The function SHALL NOT detect phases, infer causal edges/root causes, synthesize missing transcript content, or match user complaint keywords.

#### Scenario: Stats include Main and SubAgent tools

- **WHEN** Main has 10 tool calls and two full SubAgents have 4 and 6 tool calls
- **AND** one tool result in each actor is an error
- **THEN** stats SHALL report 20 tool calls and 3 tool errors
- **AND** SHALL report three total actors and two SubAgents

#### Scenario: Summary-only Agent does not invent tools

- **WHEN** a summary-only Agent record reports completed output but has no runtime messages
- **THEN** it SHALL count toward completed Agent executions
- **AND** SHALL contribute zero tool calls
- **AND** transcript stats SHALL increment `summary`

#### Scenario: Main-only Session

- **WHEN** a trajectory contains only Main with zero tool calls
- **THEN** tool calls/errors SHALL be zero with error rate `"0.0%"`
- **AND** Agent totals SHALL report one actor and zero SubAgents
- **AND** transcript completeness SHALL be complete

#### Scenario: Parallel SubAgent duration

- **WHEN** two SubAgents overlap in wall-clock time
- **THEN** Session duration SHALL remain based on Session metadata
- **AND** the system SHALL not sum process durations into Session duration

### Requirement: Stats module is independent of eval inference

The stats module SHALL accept only normalized trajectory data and SHALL be importable without loading AgentSupervisor, AgentProcessStore, CHIEF workers, rule attribution, Dashboard rendering, or filesystem modules.

#### Scenario: Stats import has no side effects

- **WHEN** the stats module is imported in isolation
- **THEN** no Agent process SHALL be created
- **AND** no model call SHALL occur
- **AND** no file SHALL be read or written

#### Scenario: Deterministic result

- **WHEN** the same immutable trajectory is passed to `computeStats()` twice
- **THEN** both results SHALL be deeply equivalent

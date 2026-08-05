## ADDED Requirements

### Requirement: Session Agent Membership Resolution

The system SHALL treat `SerializedSession.agentMessages` as the authoritative membership index for SubAgents belonging to the evaluated user task. For every unique `agentMessages[].agentId`, the system SHALL request the matching `SerializedAgentProcess` from `AgentProcessStore` and SHALL NOT include unrelated process records based only on a shared `parentSessionId`.

#### Scenario: Load exact Session members

- **WHEN** Session A contains `agentMessages` for Agent X and Agent Y
- **AND** AgentProcessStore also contains a diagnostic Agent Z with `parentSessionId` A
- **THEN** the trajectory SHALL include X and Y
- **AND** the trajectory SHALL NOT include Z

#### Scenario: Duplicate Session summaries

- **WHEN** a Session contains multiple summaries for the same `agentId`
- **THEN** the loader SHALL resolve that AgentProcess once
- **AND** SHALL use the latest terminal summary as its Session-level fallback

### Requirement: Full Transcript Loading by Agent ID

`AgentProcessStore` SHALL provide a read-only batch API that loads process records for an explicit set of Agent IDs. The API SHALL preserve input identity, distinguish missing records from records without `runtimeSnapshot.messages`, and SHALL NOT mutate Process Table or Session state.

#### Scenario: Batch load complete and missing records

- **WHEN** the loader requests Agent IDs X, Y, and Z
- **AND** X and Y exist while Z does not
- **THEN** the result SHALL return the records for X and Y
- **AND** SHALL report Z as missing without throwing

#### Scenario: Historical Session loading has no runtime side effects

- **WHEN** `/eval <historical-session-id>` loads persisted Agent records
- **THEN** no Agent process SHALL be registered, resumed, or spawned as part of transcript loading
- **AND** the current Main Process SHALL remain bound to the invoking Session

### Requirement: True Agent Actor Identity

The system SHALL represent each trajectory actor with `agentId`, `application`, `role`, and optional `parentAgentId`. A tool name SHALL be represented as `TrajectoryStep.toolName` and Action metadata, and MUST NOT be used as the Agent identity.

UI-facing Agent IDs SHALL use the existing 6-character short-ID convention while stored and analytical identities SHALL retain the full ID.

#### Scenario: Main Agent tool call

- **WHEN** the Main Agent invokes `write_file`
- **THEN** the step actor SHALL be the Main Agent
- **AND** `toolName` SHALL be `write_file`
- **AND** the causal graph SHALL NOT create a `write_file` Agent actor

#### Scenario: SubAgent tool call

- **WHEN** Explorer Agent `agent-8f31ad...` invokes `read_file`
- **THEN** the step actor SHALL have Application `explorer` and the full Agent ID
- **AND** the step Action SHALL identify `read_file`
- **AND** the Dashboard SHALL display `explorer` with short ID `8f31ad`

### Requirement: Unified Multi-Agent Trajectory

The system SHALL normalize Main messages, full SubAgent runtime messages, and SubAgent lifecycle summaries into one `MultiAgentTrajectory` containing actors, ordered steps, control edges, data edges, and an evidence summary.

Each actor's local transcript order MUST be preserved. Global step IDs SHALL be assigned deterministically by timestamp, stable actor key, and local order. Global ordering SHALL be used for stable numbering only; causal inference SHALL use explicit control and data edges.

#### Scenario: Deterministic interleaving of parallel SubAgents

- **WHEN** two SubAgents execute concurrently with overlapping timestamps
- **THEN** repeated trajectory builds from the same persisted input SHALL assign identical global step IDs
- **AND** each SubAgent's local step order SHALL remain unchanged
- **AND** the graph SHALL retain separate spawn and data dependencies instead of inferring causality from adjacency

#### Scenario: Parent-child control flow

- **WHEN** Main spawns Agent X and later receives X's output
- **THEN** the trajectory SHALL contain control edges from Main spawn to X start and from X exit to Main observation
- **AND** X's final assistant output SHALL not be duplicated as an additional synthetic output step when the full transcript exists

### Requirement: Transcript Evidence Quality

Every SubAgent actor SHALL have evidence quality `full`, `summary`, or `missing`.

- `full` SHALL require valid `runtimeSnapshot.messages`.
- `summary` SHALL use an `AgentSessionMessage` to create a coarse lifecycle step.
- `missing` SHALL retain actor identity and a diagnostic without inventing actions or results.

The trajectory SHALL expose total actor count, full transcript count, summary-only count, missing count, and overall completeness.

#### Scenario: Summary-only legacy Agent

- **WHEN** a legacy Session has an `agentMessages` record but no stored runtime transcript
- **THEN** the trajectory SHALL include a summary-quality actor and one coarse step
- **AND** the system SHALL NOT fabricate tool calls, thoughts, or a concrete internal step number

#### Scenario: Missing process evidence

- **WHEN** an Agent member has neither a valid Process record nor a usable Session summary
- **THEN** trajectory construction SHALL continue
- **AND** the evidence summary SHALL mark the actor as missing
- **AND** the Dashboard SHALL present an incomplete-evidence warning

### Requirement: Main-Only Backward Compatibility

Sessions without `agentMessages` SHALL produce a valid trajectory containing one Main actor and steps parsed from Main `messages`.

#### Scenario: Evaluate Session v1

- **WHEN** `/eval` analyzes a valid Session v1 with no SubAgent fields
- **THEN** the trajectory SHALL contain exactly one Main actor
- **AND** CHIEF analysis SHALL run without requiring AgentProcessStore records
- **AND** evidence completeness SHALL be `complete`

### Requirement: Evaluation Snapshot Isolation

The target Session and its member Agent IDs SHALL be frozen before the first CHIEF worker is spawned. Processes created by the current or previous eval runs SHALL not enter the target trajectory unless they were explicitly recorded as user-task members in the frozen Session snapshot.

#### Scenario: Re-evaluate the same Session

- **WHEN** `/eval` has previously run on Session A using process-only CHIEF workers
- **AND** `/eval` runs on A again
- **THEN** the second trajectory SHALL contain the same user-task actors as the first trajectory
- **AND** SHALL not contain prior CHIEF workers

#### Scenario: Evaluate A while invoked from B

- **WHEN** the current UI Session is B and the user runs `/eval A`
- **THEN** the target trajectory SHALL be built exclusively from persisted Session A and A's indexed task Agents
- **AND** CHIEF worker activity SHALL be routed to invoking Session B
- **AND** Session A SHALL remain unchanged

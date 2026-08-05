## MODIFIED Requirements

### Requirement: Session Parsing to History Steps

The system SHALL parse a `MultiAgentTrajectory` into ordered `TrajectoryStep` objects. Each step SHALL identify the real executing actor and keep tool execution separate from actor identity.

Each step SHALL contain:

- `stepId`: deterministic global integer index
- `agentId`: full Main/SubAgent process identity
- `application`: Agent Application name
- `role`: `"main" | "subagent"`
- `parentAgentId`: optional parent process identity
- `kind`: `"response" | "tool_call" | "spawn" | "exit" | "summary"`
- `toolName`: tool name for tool actions, otherwise undefined
- `observation`, `thought`, `action`, `result`: OTAR evidence
- `sourceMessageIndex` and actor-local order
- `timestamp`
- `isError`
- `evidenceQuality`: `"full" | "summary"`

#### Scenario: Parse Main and SubAgent tool calls

- **WHEN** Main calls `spawn_agent` and the spawned Explorer later calls `read_file`
- **THEN** the Main step SHALL identify the Main actor with `toolName: "spawn_agent"`
- **AND** the Explorer step SHALL identify the Explorer Agent ID/Application with `toolName: "read_file"`
- **AND** neither tool SHALL become an Agent actor

#### Scenario: Parse text-only Agent response

- **WHEN** a SubAgent assistant message contains text without a tool call
- **THEN** the system SHALL create a `kind: "response"` step for that SubAgent
- **AND** SHALL preserve its result text and actor identity

#### Scenario: Parse summary-only SubAgent

- **WHEN** only an `AgentSessionMessage` summary is available
- **THEN** the system SHALL create one `kind: "summary"` step with `evidenceQuality: "summary"`
- **AND** SHALL not claim internal thoughts or tool actions

### Requirement: Step 3 — Agent Nodes (Deterministic) and Step Data Flows (LLM)

The system SHALL construct `AgentNode[]` deterministically from real trajectory actors, `TrajectoryStep[]`, and `Subtask[]`. Agent nodes SHALL be keyed by stable Agent ID within a Subtask and SHALL contain Application, role, OTAR summaries, and referenced Step IDs.

The CHIEF graph worker SHALL extract step-level data flows for candidate Subtasks. Every flow SHALL reference valid source and target Step IDs and their corresponding real Agent IDs. Tool names MAY appear in Action evidence but MUST NOT populate source/target Agent identity.

#### Scenario: Multiple tools used by one Agent

- **WHEN** Explorer uses `read_file`, `grep`, and `glob` in one Subtask
- **THEN** the graph SHALL contain one Explorer Agent node for that Subtask
- **AND** its OTAR evidence SHALL reference all relevant Steps
- **AND** SHALL not create three tool-named Agent nodes

#### Scenario: Cross-Agent data transfer

- **WHEN** Explorer produces a finding consumed by Main
- **THEN** a Step data-flow edge SHALL reference Explorer as source Agent and Main as target Agent
- **AND** the edge SHALL identify the concrete producer and consumer Step IDs

### Requirement: Step 4 — Agent Edges (LLM)

The system SHALL identify dependency edges between real Agent process nodes within and across Subtasks. Each edge SHALL identify full source/target Agent IDs, Application labels, dependency type, strength, explanation, and counterfactual failure patterns.

Agent edges SHALL support observation dependency, reasoning continuation, decision dependency, environment feedback, memory reference, loop control, spawn control, and result return.

#### Scenario: Orchestrator-executor dependency

- **WHEN** Main delegates a constrained task to Explorer
- **AND** Explorer returns a result used by Main
- **THEN** the graph SHALL include Main → Explorer spawn/control evidence
- **AND** SHALL include Explorer → Main result-return/data evidence

#### Scenario: Concurrent Agents without dependency

- **WHEN** two parallel SubAgents do not exchange data and share only a Main parent
- **THEN** the graph SHALL not infer a direct Agent edge solely because their timestamps overlap

### Requirement: Step 6 — Counterfactual Root Cause Attribution (LLM)

After hierarchical backtracking produces candidate real Agent Steps, the CHIEF attribution worker SHALL select a single responsible origin using progressive causal screening:

1. **Local Attribution**: determine whether valid inputs were locally transformed into an incorrect output or whether the anomaly propagated from an upstream Agent.
2. **Planning-Control Attribution**: for loops, distinguish a Main/planner that repeats an unchanged failed strategy from an executor that fails despite valid strategy changes.
3. **Data-Flow Attribution**: trace concrete data edges to the earliest Step where valid input is fabricated, misinterpreted, or misused.
4. **Deviation-Aware Final Screening**: remove later self-corrected deviations and prefer the first irreversible point that blocks normal recovery.

The output SHALL identify `mistakeAgentId`, `mistakeApplication`, `mistakeStep`, `granularity`, `confidence`, `evidenceQuality`, reasoning, screening stages, and optional Recovery Arcs. A complete transcript attribution SHALL use Step granularity. An evidence-limited summary-only attribution SHALL use Agent granularity with `mistakeStep: null` rather than inventing a Step.

#### Scenario: Upstream SubAgent caused downstream Main symptom

- **WHEN** Explorer fabricates a value and Main later uses it correctly
- **THEN** Local Attribution SHALL exclude the Main symptom
- **AND** Data-Flow Attribution SHALL select Explorer's corruption Step

#### Scenario: Planner responsibility in a loop

- **WHEN** Main repeatedly sends semantically identical instructions after receiving failure evidence
- **THEN** Planning-Control Attribution SHALL select the Main planning Step that failed to adapt

#### Scenario: Executor responsibility in a loop

- **WHEN** Main provides valid changed strategies but a SubAgent repeatedly ignores their constraints
- **THEN** Planning-Control Attribution SHALL select the responsible SubAgent execution Step

#### Scenario: Reversible deviation filtered

- **WHEN** a candidate error is later corrected and the relevant Oracle acceptance criteria are re-satisfied before downstream impact
- **THEN** Final Screening SHALL assign that candidate minimal responsibility
- **AND** SHALL prefer an irreversible candidate with stronger downstream impact

#### Scenario: Summary-only final attribution

- **WHEN** available evidence identifies a responsible SubAgent but its internal transcript is unavailable
- **THEN** attribution SHALL use `granularity: "agent"` and `mistakeStep: null`
- **AND** confidence/evidence quality SHALL indicate partial evidence

## ADDED Requirements

### Requirement: CHIEF Virtual Oracle Synthesis

The system SHALL synthesize one structured Virtual Oracle per Subtask in forward Subtask order. Each Oracle SHALL contain Goal, Preconditions, Key Evidence, and Acceptance Criteria.

Oracle synthesis SHALL consider the original user objective, previous Oracles, upstream outputs, later user feedback, final execution state, and the remaining trajectory. It SHALL perform a global consistency check so Preconditions only depend on information available before the Subtask and Acceptance Criteria are falsifiable.

#### Scenario: Sequential Oracle constraints

- **WHEN** Subtask S2 depends on output from S1
- **THEN** S2 Preconditions MAY reference S1's expected output
- **AND** S1 SHALL not depend on evidence first created in S2

#### Scenario: Creative task Oracle

- **WHEN** the user objective includes distinctive visual quality
- **THEN** the Oracle SHALL include checkable quality criteria derived from user intent and feedback
- **AND** SHALL not reduce success to tool execution alone

### Requirement: Hierarchical Oracle-Guided Backtracking

The system SHALL perform candidate localization in three ordered levels:

1. Traverse Subtasks in reverse topological order and compare actual outputs with Oracle Goals and Acceptance Criteria.
2. Within candidate Subtasks, compare each real Agent OTAR with Oracle Preconditions and Key Evidence.
3. Within candidate Agents, compare concrete Steps with the Agent OTAR and full Subtask Oracle.

Only candidates from the preceding level SHALL be inspected at the next level. The output SHALL preserve candidate Subtasks, Agent IDs, and Step IDs as separate sets.

#### Scenario: Backtracking prunes healthy Subtasks

- **WHEN** six Subtasks exist and only S3 and S4 violate their Oracles
- **THEN** Agent-level evaluation SHALL inspect Agents from S3 and S4
- **AND** SHALL not inspect Agents exclusively belonging to healthy Subtasks

#### Scenario: Backtracking uses real Agent IDs

- **WHEN** two Explorer processes use the same Application in one Session
- **THEN** Agent candidates SHALL distinguish them by full Agent ID
- **AND** Step candidates SHALL remain associated with the correct process

### Requirement: Unified CHIEF Pipeline

All Session sizes SHALL use the same CHIEF stages and output contracts. Session size SHALL only control deterministic workspace chunking and worker read strategy.

#### Scenario: Small Session

- **WHEN** a Session has 80 Steps
- **THEN** it SHALL execute graph, oracle, backtracking, attribution, and rule stages through CHIEF workers

#### Scenario: Large Session

- **WHEN** a Session has 800 Steps
- **THEN** it SHALL execute the same CHIEF stages
- **AND** workspace preparation SHALL split the trajectory into bounded chunks
- **AND** the resulting attribution schema SHALL be identical to the small Session path

## REMOVED Requirements

### Requirement: Adaptive Pipeline Path Selection

**Reason**: Step-count routing created two semantically different attribution pipelines and neither modeled persisted SubAgents as true actors.

**Migration**: Use the unified CHIEF Pipeline; adapt input chunking instead of changing analytical semantics.

### Requirement: Agent-Based Analysis Pipeline (Focus Path)

**Reason**: SCAN/ZOOM/SYNTHESIZE was a project-specific substitute for the paper's Oracle-guided hierarchy and ran through a private Agent loop.

**Migration**: Use Supervisor-backed graph, oracle, hierarchical backtracking, and attribution workers.

### Requirement: Pipeline Fallback on Agent Failure

**Reason**: Returning empty zones or default attributions can produce a misleading successful Dashboard.

**Migration**: Validate worker output, retry once in a fresh process, then fail the eval stage explicitly without overwriting the latest successful Dashboard.

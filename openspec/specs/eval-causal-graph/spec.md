# eval-causal-graph Specification

## Purpose

基于 CHIFF（From Flat Logs to Causal Graphs）方法论的 session 因果图分析引擎。将 dscode session 日志从扁平消息序列转换为结构化的因果图（包含子任务分解、Agent OTAR 节点、数据流边、Agent 依赖边），并通过统一的 CHIEF pipeline 和反事实推理定位单一根因。
## Requirements
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

### Requirement: Step 1 — Subtask Decomposition (LLM)

The system SHALL call an LLM to decompose the session into a sequence of subtasks. The LLM prompt SHALL include:
- The session question/title
- A summary of history steps (stepId, agent, action, thought first 100 chars)
- Instruction to output subtasks with: name, step range (inclusive), oracle (goal + preconditions + key evidence + acceptance criteria), loop info (is_loop_related, loop_role, reversibility, risk_score), and **phaseStatus** ("ok" | "warn" | "danger" — derived from error/complaint presence in the subtask's step range)

The LLM output SHALL be parsed as JSON and validated against the `Subtask[]` schema. Each subtask SHALL have a unique ID ("S1", "S2", ...). Step ranges MUST cover all steps from 0 to N-1, be non-overlapping, and be contiguous. The subtask array SHALL serve as the **sole source** of phase information for the eval dashboard.

The oracle field SHALL be structured as `{ goal, preconditions[], key_evidence[], acceptance_criteria[] }`.

When `onLog` callback is provided, the system SHALL call `onLog("🔍 Phase 1/6: 分解子任务...")` before the LLM call and `onLog("✓ Phase 1/6 完成")` after successful completion.

#### Scenario: Successful subtask decomposition

- **WHEN** Step 1 LLM call returns valid JSON with subtask array
- **THEN** subtasks SHALL cover all history steps without gaps or overlaps
- **AND** each subtask SHALL have a non-empty name, oracle with at least a goal, and phaseStatus
- **AND** phaseStatus SHALL be "danger" for subtasks containing tool errors or user frustration
- **AND** loop_info SHALL default to `{ is_loop_related: false, loop_role: "none", reversibility: "reversible", loop_risk_score: 0 }`

#### Scenario: Subtask decomposition with loop detection

- **WHEN** the session contains a repair-retry pattern (same tool repeatedly called on same file)
- **THEN** at least one subtask SHALL have `loop_info.is_loop_related: true`
- **AND** loop_role SHALL be "entry", "internal", or "exit" for loop-related subtasks

#### Scenario: LLM output parse failure

- **WHEN** Step 1 LLM returns text that cannot be parsed as valid JSON matching the Subtask[] schema
- **THEN** the system SHALL retry once with a correction hint
- **AND** if retry also fails, SHALL throw an error to the caller

#### Scenario: Progress logged with onLog callback

- **WHEN** `onLog` is provided and Step 1 is about to execute
- **THEN** `onLog("🔍 Phase 1/6: 分解子任务...")` SHALL be called before the LLM call
- **AND** `onLog("✓ Phase 1/6 完成")` SHALL be called after successful completion

### Requirement: Step 2 — Subtask Edges (LLM)

The system SHALL call an LLM to identify edges between adjacent subtasks. The LLM prompt SHALL include:
- The subtask list from Step 1
- History step summaries
- Instruction to output edges for each adjacent pair (S1→S2, S2→S3, ...)

Each `SubtaskEdge` SHALL contain: source subtask ID, target subtask ID, dependency type ("data_dependency" | "logical_prereq"), strength (0.0-1.0), explanation, data_transfer items (upstream outputs → downstream usages with consistency_score), and failure_modes (each with type, description, severity).

When `onLog` callback is provided, the system SHALL call `onLog("🔗 Phase 2/6: 识别子任务依赖...")` before the LLM call and `onLog("✓ Phase 2/6 完成")` after successful completion.

#### Scenario: Edge generation for multi-subtask session

- **WHEN** Step 1 produced 3+ subtasks
- **THEN** Step 2 SHALL produce exactly N-1 edges connecting adjacent pairs
- **AND** each edge SHALL have at least one data_transfer item or a logical dependency explanation

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

### Requirement: Causal Graph Assembly (deterministic)

The system SHALL assemble a complete causal graph from Step 1-4 outputs using pure TypeScript functions (no LLM). The `CausalGraphStore.addSubtasks()`, `.addSubtaskEdges()`, `.addAgentNodes()`, `.addAgentEdges()`, `.addStepDataFlows()` methods SHALL populate the graph.

After assembly, `isGraphComplete()` SHALL verify:
- Subtask step ranges cover 0..N-1 without gaps or overlaps
- Every subtask has at least one AgentNode
- Every adjacent subtask pair has a SubtaskEdge

If `isGraphComplete()` returns false, the system SHALL throw an error to the caller.

#### Scenario: Graph completeness validation

- **WHEN** Step 1-4 outputs are added to the graph store
- **THEN** `isGraphComplete()` SHALL return true only if all coverage checks pass
- **AND** `validateCoverage()` SHALL return an empty array on success

#### Scenario: Incomplete graph throws error

- **WHEN** `isGraphComplete()` returns false (e.g., a subtask has no agent nodes)
- **THEN** the system SHALL throw an error

### Requirement: Step 5 — Candidate Error Set (LLM)

The system SHALL call an LLM to generate a candidate error set from the causal graph. The LLM prompt SHALL include:
- The complete causal graph snapshot (subtasks, edges, agents, data flows)
- The original question and history summary
- Instruction to output at least 5 candidate error steps

Each `CandidateStep` SHALL contain: step_id, agents_in_step, in_loop, loop_role, data_issue, data_item, source_step, irrecoverable, irrecoverable_reason, affected_steps, impact_score, confidence, and **deviationDescription** (a human-readable description of what went wrong at this step, suitable for display in the dashboard deviations section).

The system SHALL enforce that the candidate set contains at least 5 steps. If the LLM returns fewer, the system SHALL retry with a "need at least 5 candidates" hint.

The candidate error set SHALL serve as the **sole source** of deviation information for the eval dashboard.

When `onLog` callback is provided, the system SHALL call `onLog("🎯 Phase 5/6: 生成候选错误集...")` before the LLM call and `onLog("✓ Phase 5/6 完成")` after successful completion.

#### Scenario: Candidate set generation with deviation descriptions

- **WHEN** Step 5 LLM is called with a complete causal graph
- **THEN** the output SHALL contain a `CandidateSet` with at least 5 candidate steps
- **AND** each candidate SHALL include a `deviationDescription` summarizing the issue
- **AND** candidates SHALL be ranked by impact_score descending

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

### Requirement: Structured Output Parsing

All LLM responses SHALL be parsed via `extractJSON(text)` to locate a JSON block, then validated against Zod schemas. Parse failures SHALL trigger at most one retry with a format correction hint. Two consecutive failures for any step SHALL throw an error to the caller.

#### Scenario: Invalid structured output is retried once

- **WHEN** an LLM response does not contain JSON valid against the stage schema
- **THEN** the system SHALL retry once with a format correction hint
- **AND** a second invalid response SHALL return an error to the caller

### Requirement: CHIEF Pipeline Output Consistency

The Supervisor-backed CHIEF pipeline SHALL produce one validated `EvalResult`
shape for every Session size and Agent topology.

#### Scenario: CHIEF pipeline produces valid EvalResult

- **WHEN** the CHIEF pipeline completes successfully
- **THEN** it SHALL produce an `EvalResult` with all required fields
- **AND** Dashboard generation SHALL consume that result without a legacy
  pipeline adapter

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

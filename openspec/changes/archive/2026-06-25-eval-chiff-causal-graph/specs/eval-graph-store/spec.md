# eval-graph-store Specification

## Purpose

确定性因果图存储与查询模块。所有图操作（节点/边的增删查、拓扑排序、数据流路径追溯、循环组识别、覆盖校验）均为纯 TypeScript 函数，不涉及 LLM 调用，确保可单测、无幻觉。

## ADDED Requirements

### Requirement: Subtask Storage and Coverage Validation

The `CausalGraphStore` SHALL store subtasks and validate that their step ranges cover all history steps from 0 to N-1 without gaps or overlaps.

#### Scenario: Valid subtask coverage

- **WHEN** subtasks S1(0-3), S2(4-7), S3(8-12) are added with totalSteps=13
- **THEN** `validateCoverage()` SHALL return an empty array
- **AND** `isGraphComplete()` step-coverage check SHALL pass

#### Scenario: Gap in subtask coverage

- **WHEN** subtasks S1(0-3), S2(6-9) are added with totalSteps=10
- **THEN** `validateCoverage()` SHALL return an error about steps 4-5 not covered

#### Scenario: Overlap in subtask coverage

- **WHEN** subtasks S1(0-3), S2(2-5) are added
- **THEN** `validateCoverage()` SHALL return an error about overlapping steps 2-3

#### Scenario: Coverage does not reach end

- **WHEN** subtasks S1(0-3) is added with totalSteps=10
- **THEN** `validateCoverage()` SHALL return an error about steps 4-9 not covered

### Requirement: Agent Node Storage

The `CausalGraphStore` SHALL store agent nodes and associate them with subtasks. Each agent node SHALL have a `subtask_id` referencing an existing subtask.

#### Scenario: Agent nodes added per subtask

- **WHEN** agent nodes are added for subtasks S1 and S2
- **THEN** querying agent nodes for S1 SHALL return only S1's nodes
- **AND** `isGraphComplete()` SHALL verify every subtask has at least one agent node

#### Scenario: Missing agent nodes detection

- **WHEN** subtask S1 has agent nodes but S2 has none
- **THEN** `isGraphComplete()` SHALL return false
- **AND** `validateCoverage()` SHALL include "Subtask S2 has no agent nodes"

### Requirement: Subtask Edge Storage

The `CausalGraphStore` SHALL store subtask edges (SubtaskEdge[]) connecting adjacent subtask pairs.

#### Scenario: Edge completeness check

- **WHEN** subtasks S1, S2, S3 exist and edges S1→S2, S2→S3 are added
- **THEN** `isGraphComplete()` SHALL return true for edge connectivity
- **AND** querying edges from S1 SHALL return [S1→S2]

#### Scenario: Missing edge detection

- **WHEN** subtasks S1, S2, S3 exist but only S1→S2 edge is added
- **THEN** `isGraphComplete()` SHALL return false
- **AND** missing edge S2→S3 SHALL be reported

### Requirement: Agent Edge Storage

The `CausalGraphStore` SHALL store agent edges (AgentEdge[]) within each subtask.

#### Scenario: Agent edges per subtask

- **WHEN** agent edges are added for S1 (A→B) and S2 (C→D)
- **THEN** querying agent edges for S1 SHALL return only A→B

### Requirement: Step Data Flow Storage

The `CausalGraphStore` SHALL store step-level data flows (StepDataFlow[]) tracking data movement between steps.

#### Scenario: Data flow traceability

- **WHEN** data flows from step 3 to step 7 and step 7 to step 11 tracking file "src/foo.ts"
- **THEN** `getDataflowPath("src/foo.ts")` SHALL return [StepDataFlow(3→7), StepDataFlow(7→11)]

### Requirement: Topological Order Query

The `CausalGraphStore` SHALL compute the topological order of subtasks based on edge dependencies. The result SHALL be an array of subtask IDs in dependency order.

#### Scenario: Linear dependency chain

- **WHEN** edges are S1→S2→S3
- **THEN** `getTopoOrder()` SHALL return ["S1", "S2", "S3"]

#### Scenario: Reverse topological order

- **WHEN** `getTopoOrder({ reverse: true })` is called on S1→S2→S3
- **THEN** the result SHALL be ["S3", "S2", "S1"]

### Requirement: Predecessor Query

The `CausalGraphStore` SHALL return all step IDs that are data-flow predecessors of a given step ID. Predecessors include: steps in the same subtask that produce data consumed by the target step, plus steps in upstream subtasks that produce data transferred via subtask edges.

#### Scenario: Predecessor lookup

- **WHEN** step 8 consumes data produced by steps 3 and 5
- **THEN** `getPredecessors(8)` SHALL return [3, 5] (in ascending order)

#### Scenario: No predecessors

- **WHEN** step 0 is queried for predecessors
- **THEN** `getPredecessors(0)` SHALL return []

### Requirement: Loop Group Identification

The `CausalGraphStore` SHALL group steps by `loop_group_id` from subtask loop_info. Steps within the same loop group SHALL be returned together.

#### Scenario: Loop group query

- **WHEN** subtasks S2 and S3 share `loop_group_id: "L1"`
- **THEN** `getLoopGroups()` SHALL include "L1" → [all steps in S2 and S3]

#### Scenario: No loops in session

- **WHEN** no subtasks have `is_loop_related: true`
- **THEN** `getLoopGroups()` SHALL return an empty Map

### Requirement: Subtask of Step Resolution

The `CausalGraphStore` SHALL return the subtask ID that contains a given step ID.

#### Scenario: Step within subtask range

- **WHEN** step 5 is queried and subtask S2 covers steps 4-7
- **THEN** `getSubtaskOfStep(5)` SHALL return "S2"

#### Scenario: Step not covered

- **WHEN** step 99 is queried and totalSteps is 50
- **THEN** `getSubtaskOfStep(99)` SHALL return null

### Requirement: Graph Snapshot for LLM Context

The `CausalGraphStore` SHALL provide a `snapshot()` method that returns a compact, JSON-serializable representation of the entire causal graph for injection into Step 5 and Step 6 LLM prompts. The snapshot SHALL include: subtask summaries (name, step range, oracle goal, loop summary), edge summaries (type, strength, key data transfers), agent summaries (agent name, key action), and data flow paths (data_item → chain of steps).

#### Scenario: Snapshot for LLM prompt

- **WHEN** `snapshot()` is called after a complete graph is built
- **THEN** the returned object SHALL be valid JSON
- **AND** SHALL contain subtask, edge, agent, and dataflow summaries suitable for prompt injection

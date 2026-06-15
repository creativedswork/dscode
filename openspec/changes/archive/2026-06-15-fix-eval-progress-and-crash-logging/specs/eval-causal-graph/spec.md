# eval-causal-graph Delta Specification

## MODIFIED Requirements

### Requirement: Step 1 — Subtask Decomposition (LLM)

The system SHALL call an LLM to decompose the session into a sequence of subtasks. The LLM prompt SHALL include:
- The session question/title
- A summary of history steps (stepId, agent, action, thought first 100 chars)
- Instruction to output subtasks with: name, step range (inclusive), oracle (goal + preconditions + key evidence + acceptance criteria), and loop info (is_loop_related, loop_role, reversibility, risk_score)

The LLM output SHALL be parsed as JSON and validated against the `Subtask[]` schema. Each subtask SHALL have a unique ID ("S1", "S2", ...). Step ranges MUST cover all steps from 0 to N-1, be non-overlapping, and be contiguous.

The oracle field SHALL be structured as `{ goal, preconditions[], key_evidence[], acceptance_criteria[] }` — an upgrade from CHIFF's original one-line oracle.

**ADDED**: When `onLog` callback is provided, the system SHALL call `onLog("🔍 Phase 1/6: 分解子任务...")` before the LLM call and `onLog("✓ Phase 1/6 完成")` after successful completion.

#### Scenario: Successful subtask decomposition

- **WHEN** Step 1 LLM call returns valid JSON with subtask array
- **THEN** subtasks SHALL cover all history steps without gaps or overlaps
- **AND** each subtask SHALL have a non-empty name and oracle with at least a goal
- **AND** loop_info SHALL default to `{ is_loop_related: false, loop_role: "none", reversibility: "reversible", loop_risk_score: 0 }`

#### Scenario: Subtask decomposition with loop detection

- **WHEN** the session contains a repair-retry pattern (same tool repeatedly called on same file)
- **THEN** at least one subtask SHALL have `loop_info.is_loop_related: true`
- **AND** loop_role SHALL be "entry", "internal", or "exit" for loop-related subtasks

#### Scenario: LLM output parse failure

- **WHEN** Step 1 LLM returns text that cannot be parsed as valid JSON matching the Subtask[] schema
- **THEN** the system SHALL retry once with a correction hint
- **AND** if retry also fails, SHALL fall back to rule-engine analysis

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

**ADDED**: When `onLog` callback is provided, the system SHALL call `onLog("🔗 Phase 2/6: 识别子任务依赖...")` before the LLM call and `onLog("✓ Phase 2/6 完成")` after successful completion.

#### Scenario: Edge generation for multi-subtask session

- **WHEN** Step 1 produced 3+ subtasks
- **THEN** Step 2 SHALL produce exactly N-1 edges connecting adjacent pairs
- **AND** each edge SHALL have at least one data_transfer item or a logical dependency explanation

### Requirement: Step 3 — Agent Nodes and Step Data Flows (LLM)

The system SHALL call an LLM to extract agent nodes (OTAR) and step-level data flows for each subtask. The LLM prompt SHALL include:
- Subtask definitions
- History steps within each subtask's range
- Instruction to output AgentNode[] with OTAR fields and StepDataFlow[] with data item tracking

Each `AgentNode` SHALL contain: subtask_id, otar (observation, thought, action, result), and step_ids (list of step indices this agent action covers).

Each `StepDataFlow` SHALL contain: subtask_id, from_step, to_step, source_agent, target_agent, data_item, data_type, transformation, correctness ("correct" | "misinterpreted" | "misused" | "fabricated"), and confidence (0.0-1.0).

**ADDED**: When `onLog` callback is provided, the system SHALL call `onLog("🤖 Phase 3/6: 提取 Agent 节点...")` before the LLM call and `onLog("✓ Phase 3/6 完成")` after successful completion.

#### Scenario: OTAR extraction for tool-call session

- **WHEN** the session has clear thinking→toolCall→toolResult sequences
- **THEN** each `AgentNode.otar` SHALL map thinking→thought, toolCall→action, toolResult→result
- **AND** `agent` SHALL be the tool name

#### Scenario: Data flow between steps

- **WHEN** step 5 reads a file and step 8 modifies the same file
- **THEN** a `StepDataFlow` SHALL be created with from_step=5, to_step=8
- **AND** `data_item` SHALL be the file path
- **AND** `correctness` SHALL be "correct" if the file content was used correctly

### Requirement: Step 4 — Agent Edges (LLM)

The system SHALL call an LLM to identify dependency edges between agents within each subtask. The LLM prompt SHALL include:
- Subtasks and their agent nodes
- Instruction to output agent edges with dependency type and failure modes

Each `AgentEdge` SHALL contain: subtask_id, source agent, target agent, dependency type (one of: "obs_dependency", "reasoning_continuation", "decision_dependency", "environment_feedback", "memory_ref", "loop_control"), strength, explanation, and failure_modes.

**ADDED**: When `onLog` callback is provided, the system SHALL call `onLog("🔗 Phase 4/6: 识别 Agent 依赖边...")` before the LLM call and `onLog("✓ Phase 4/6 完成")` after successful completion.

#### Scenario: Agent dependency detection

- **WHEN** a `read_file` agent produces data consumed by a `write_file` agent's decision
- **THEN** an `AgentEdge` SHALL be created with type "obs_dependency"
- **AND** `src_agent` SHALL be "read_file", `dst_agent` SHALL be "write_file"

### Requirement: Step 5 — Candidate Error Set (LLM)

The system SHALL call an LLM to generate a candidate error set from the causal graph. The LLM prompt SHALL include:
- The complete causal graph snapshot (subtasks, edges, agents, data flows)
- The original question and history summary
- Instruction to output at least 5 candidate error steps

Each `CandidateStep` SHALL contain: step_id, agents_in_step, in_loop, loop_role, data_issue, data_item, source_step, irrecoverable, irrecoverable_reason, affected_steps, impact_score, confidence.

The system SHALL enforce that the candidate set contains at least 5 steps. If the LLM returns fewer, the system SHALL retry with a "need at least 5 candidates" hint.

**ADDED**: When `onLog` callback is provided, the system SHALL call `onLog("🎯 Phase 5/6: 生成候选错误集...")` before the LLM call and `onLog("✓ Phase 5/6 完成")` after successful completion.

#### Scenario: Candidate set generation

- **WHEN** Step 5 LLM is called with a complete causal graph
- **THEN** the output SHALL contain a `CandidateSet` with at least 5 candidate steps
- **AND** candidates SHALL be ranked by impact_score descending

### Requirement: Step 6 — Counterfactual Root Cause Attribution (LLM)

The system SHALL call an LLM to determine the single root cause from the candidate set using three counterfactual rules:

**Rule 1 (Control Flow / Loop)**: If a loop is involved, determine whether the loop was justified. If not, attribute to the decision to enter the loop. If yes, attribute to the irreversible action within or after the loop.

**Rule 2 (Data Flow)**: Trace each key data item used in the final failure. If upstream data was misinterpreted → blame current executor. If data was fabricated without upstream source → blame generator. If data was correct but misused → blame misusing node.

**Rule 3 (Irrecoverable Point)**: Attribute to the FIRST node that made the correct path unrecoverable by normal means, not necessarily the first deviating node.

The LLM SHALL output an `Attribution` with: mistake_agent, mistake_step, reason, and rules_applied (list of "Rule1"/"Rule2"/"Rule3").

**ADDED**: When `onLog` callback is provided, the system SHALL call `onLog("⚖️ Phase 6/6: 反事实归因...")` before the LLM call and `onLog("✓ Phase 6/6 完成")` after successful completion.

#### Scenario: Root cause attributed via Rule 2

- **WHEN** a `read_file` call returned correct data but a subsequent `write_file` misinterpreted it
- **THEN** `mistake_agent` SHALL be "write_file"
- **AND** `rules_applied` SHALL include "Rule2"
- **AND** `reason` SHALL describe the data misinterpretation

#### Scenario: Root cause attributed via Rule 3

- **WHEN** the earliest deviation was at step 12 but the first irreversible action was at step 18
- **THEN** `mistake_step` SHALL be 18
- **AND** `rules_applied` SHALL include "Rule3"
- **AND** `reason` SHALL explain why step 18 was the point of no return

#### Scenario: Attribution validation failure

- **WHEN** Step 6 LLM returns an agent name or step number not present in the session
- **THEN** the system SHALL retry with a correction hint
- **AND** if retry also fails, SHALL fall back to the highest-impact candidate from Step 5

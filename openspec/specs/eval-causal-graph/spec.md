# eval-causal-graph Specification

## Purpose

基于 CHIFF（From Flat Logs to Causal Graphs）方法论的 session 因果图分析引擎。将 dscode session 日志从扁平消息序列转换为结构化的因果图（包含子任务分解、Agent OTAR 节点、数据流边、Agent 依赖边），并通过反事实推理（Rule1/2/3）定位单一根因。

## ADDED Requirements

### Requirement: Session Parsing to History Steps

The system SHALL parse a `SerializedSession` into an ordered array of `HistoryStep` objects, where each step represents a single agent action (tool call) with its surrounding context.

Each `HistoryStep` SHALL contain:
- `stepId`: sequential integer index
- `agent`: tool name from `toolCall.name` (agent identity)
- `observation`: content of the user message or toolResult that triggered this action
- `thought`: text from the `thinking` block in the assistant message
- `action`: `"toolName(args_summary)"` string derived from `toolCall.name` and key arguments
- `result`: first 500 characters of the corresponding `toolResult` content
- `messageIdx`: index into the original session messages array
- `isError`: whether the corresponding toolResult indicates an error
- `timestamp`: Unix ms timestamp from the original message

#### Scenario: Parse session with tool calls

- **WHEN** a session contains an assistant message with thinking block and `toolCall` blocks, followed by `toolResult` messages
- **THEN** the system SHALL produce one `HistoryStep` per `toolCall`
- **AND** `agent` SHALL be set to the tool name (e.g., `"read_file"`, `"write_file"`)
- **AND** `thought` SHALL contain the thinking text
- **AND** `action` SHALL be a compact representation of the tool call (e.g., `"write_file(path='src/foo.ts')"`)

#### Scenario: Parse session with user messages

- **WHEN** a session contains user text messages between assistant tool calls
- **THEN** the user message content SHALL appear as `observation` in the next `HistoryStep`
- **AND** user messages without following tool calls SHALL be preserved as standalone entries with `agent: "user"`

#### Scenario: Parse session without thinking blocks

- **WHEN** an assistant message has `toolCall` blocks but no `thinking` block
- **THEN** `thought` SHALL be set to the assistant's text response (first 200 characters) or empty string if none exists

### Requirement: Step 1 — Subtask Decomposition (LLM)

The system SHALL call an LLM to decompose the session into a sequence of subtasks. The LLM prompt SHALL include:
- The session question/title
- A summary of history steps (stepId, agent, action, thought first 100 chars)
- Instruction to output subtasks with: name, step range (inclusive), oracle (goal + preconditions + key evidence + acceptance criteria), and loop info (is_loop_related, loop_role, reversibility, risk_score)

The LLM output SHALL be parsed as JSON and validated against the `Subtask[]` schema. Each subtask SHALL have a unique ID ("S1", "S2", ...). Step ranges MUST cover all steps from 0 to N-1, be non-overlapping, and be contiguous.

The oracle field SHALL be structured as `{ goal, preconditions[], key_evidence[], acceptance_criteria[] }` — an upgrade from CHIFF's original one-line oracle.

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

### Requirement: Step 2 — Subtask Edges (LLM)

The system SHALL call an LLM to identify edges between adjacent subtasks. The LLM prompt SHALL include:
- The subtask list from Step 1
- History step summaries
- Instruction to output edges for each adjacent pair (S1→S2, S2→S3, ...)

Each `SubtaskEdge` SHALL contain: source subtask ID, target subtask ID, dependency type ("data_dependency" | "logical_prereq"), strength (0.0-1.0), explanation, data_transfer items (upstream outputs → downstream usages with consistency_score), and failure_modes (each with type, description, severity).

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

#### Scenario: Agent dependency detection

- **WHEN** a `read_file` agent produces data consumed by a `write_file` agent's decision
- **THEN** an `AgentEdge` SHALL be created with type "obs_dependency"
- **AND** `src_agent` SHALL be "read_file", `dst_agent` SHALL be "write_file"

### Requirement: Causal Graph Assembly (deterministic)

The system SHALL assemble a complete causal graph from Step 1-4 outputs using pure TypeScript functions (no LLM). The `CausalGraphStore.addSubtasks()`, `.addSubtaskEdges()`, `.addAgentNodes()`, `.addAgentEdges()`, `.addStepDataFlows()` methods SHALL populate the graph.

After assembly, `isGraphComplete()` SHALL verify:
- Subtask step ranges cover 0..N-1 without gaps or overlaps
- Every subtask has at least one AgentNode
- Every adjacent subtask pair has a SubtaskEdge

If `isGraphComplete()` returns false, the system SHALL NOT proceed to Step 5 and SHALL fall back to rule-engine analysis.

#### Scenario: Graph completeness validation

- **WHEN** Step 1-4 outputs are added to the graph store
- **THEN** `isGraphComplete()` SHALL return true only if all coverage checks pass
- **AND** `validateCoverage()` SHALL return an empty array on success

#### Scenario: Incomplete graph prevents backtrack phase

- **WHEN** `isGraphComplete()` returns false (e.g., a subtask has no agent nodes)
- **THEN** the system SHALL NOT call Step 5 LLM
- **AND** SHALL fall back to rule-engine analysis

### Requirement: Step 5 — Candidate Error Set (LLM)

The system SHALL call an LLM to generate a candidate error set from the causal graph. The LLM prompt SHALL include:
- The complete causal graph snapshot (subtasks, edges, agents, data flows)
- The original question and history summary
- Instruction to output at least 5 candidate error steps

Each `CandidateStep` SHALL contain: step_id, agents_in_step, in_loop, loop_role, data_issue, data_item, source_step, irrecoverable, irrecoverable_reason, affected_steps, impact_score, confidence.

The system SHALL enforce that the candidate set contains at least 5 steps. If the LLM returns fewer, the system SHALL retry with a "need at least 5 candidates" hint.

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

### Requirement: Structured Output Parsing

All LLM responses SHALL be parsed via `extractJSON(text)` to locate a JSON block, then validated against Zod schemas. Parse failures SHALL trigger at most one retry with a format correction hint. Two consecutive failures for any step SHALL cause fallback to rule-engine analysis.

#### Scenario: JSON block extraction from markdown-wrapped response

- **WHEN** the LLM wraps JSON in ```json code fences
- **THEN** `extractJSON()` SHALL strip the fences and return the pure JSON string

#### Scenario: Malformed JSON from LLM

- **WHEN** the LLM returns text without valid JSON
- **THEN** the system SHALL retry once with hint "Output must be valid JSON matching the specified schema, without markdown wrapping or additional text"
- **AND** if retry fails, SHALL fall back

### Requirement: Progress Reporting

The system SHALL report progress to the UI during the 8-step analysis pipeline. Each step (0-8) SHALL display a message: "Step X/8: <step_description>...". Step 0 (deterministic parsing and stats) SHALL complete immediately and display initial statistics. Steps 1-6 SHALL be LLM calls (with retry). Steps 7-8 SHALL be deterministic (no LLM). Steps 7-8 SHALL NOT report individual progress messages (they complete near-instantly).

#### Scenario: Progress during analysis

- **WHEN** `/eval` is invoked on a valid session
- **THEN** the UI SHALL show "正在解析 session..." for Step 0
- **AND** then "Step 1/8: 分解子任务..." through "Step 6/8: 反事实根因裁决..."
- **AND** Steps 7-8 SHALL complete silently (no separate progress message needed)

### Requirement: Step 7 — Rule Abstraction (deterministic)

After Step 6 attribution is complete, the system SHALL execute Step 7: Rule Abstraction. This step SHALL be deterministic (no LLM call) and SHALL map the CHIFF causal graph (`CausalGraphStore` snapshot) and `Attribution` to a set of `HarnessRule` IDs from the pre-defined catalog, as specified in `harness-rule-extraction`.

The step SHALL also execute all registered statistical and behavioral detectors against the session data (tool call stats, message patterns, phase info) to trigger additional rules beyond those linked to CHIFF attribution.

#### Scenario: Step 7 runs after successful Step 6

- **WHEN** CHIFF Steps 1-6 complete successfully and produce an `Attribution`
- **THEN** Step 7 SHALL execute `extractRules(causalGraph, attribution, stats)`
- **AND** produce a `HarnessRule[]` array
- **AND** the array SHALL include rules linked to the attribution (e.g., R_IRRECOVERABLE_ACTION for Rule3)

#### Scenario: Step 7 runs on rule-engine fallback

- **WHEN** the pipeline falls back to rule-engine mode before Step 6
- **THEN** Step 7 SHALL still execute with `attribution = null`
- **AND** SHALL run all non-attribution-dependent detectors (statistical, behavioral)
- **AND** produce rules that can be detected without CHIFF attribution

### Requirement: Step 8 — Rule Deduplication and Merging (deterministic)

After Step 7 extraction, the system SHALL execute Step 8: Rule Deduplication and Merging. This step SHALL load the existing `RuleStore` from `~/.dscode/eval/rules.json`, call `mergeRules(existing, new)`, and save the merged result back to the store. This step SHALL be deterministic (pure TypeScript data merge, no LLM).

#### Scenario: New rules merged with existing store

- **WHEN** Step 7 produces `[R_BASH_OVERUSE, R_DATA_MISINTERPRET]` and the store already has `R_BASH_OVERUSE` with 2 evidence entries
- **THEN** the merged store SHALL have `R_BASH_OVERUSE` with 3 evidence entries
- **AND** `R_DATA_MISINTERPRET` SHALL be added as a new rule
- **AND** the store SHALL be written to `rules.json`

#### Scenario: No new rules triggered

- **WHEN** Step 7 produces an empty `HarnessRule[]`
- **THEN** Step 8 SHALL still load and save the store (preserving existing rules)
- **AND** no rules SHALL be added or modified

### Requirement: EvalResult uses rules instead of suggestions

The `EvalResult` interface SHALL replace `suggestions: string[]` with `rules: HarnessRule[]`. The `mergePipelineResults` function SHALL populate `EvalResult.rules` from the merged Rule Store after Step 8. The output SHALL include all rules currently in the store (both newly triggered and pre-existing), allowing the dashboard to show the complete rule state.

#### Scenario: EvalResult contains rules after pipeline

- **WHEN** `runCausalGraphPipeline` completes successfully
- **THEN** `EvalResult.rules` SHALL be a `HarnessRule[]`
- **AND** `EvalResult.suggestions` SHALL NOT exist (removed from interface)
- **AND** rules SHALL include both newly triggered and pre-existing rules from the store

#### Scenario: EvalResult on fallback contains rules

- **WHEN** the pipeline falls back to rule engine
- **THEN** `EvalResult.rules` SHALL still be populated from the merged store
- **AND** `EvalResult.analysisMode` SHALL remain `"rule"`

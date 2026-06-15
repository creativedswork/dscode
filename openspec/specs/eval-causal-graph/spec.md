# eval-causal-graph Specification

## Purpose

基于 CHIFF（From Flat Logs to Causal Graphs）方法论的 session 因果图分析引擎。将 dscode session 日志从扁平消息序列转换为结构化的因果图（包含子任务分解、Agent OTAR 节点、数据流边、Agent 依赖边），并通过反事实推理（Rule1/2/3/4）定位单一根因。支持 Completion-based 快速路径（<500 steps）和 Agent-based Focus 路径（≥500 steps）。

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

### Requirement: Adaptive Pipeline Path Selection

The system SHALL select between the Agent-based focus pipeline and the completion-based fast path based on session step count.

When `steps.length >= FOCUS_PATH_THRESHOLD` (default 500):
- The system SHALL use the Agent-based pipeline (`runFocusPipeline`)
- The system SHALL first write the workspace to `~/.dscode/eval/{sessionId}/library/`
- Each CHIFF Pass SHALL spawn an independent Agent session with file system tools
- The system SHALL display Phase progress during Agent execution

When `steps.length < FOCUS_PATH_THRESHOLD`:
- The system SHALL use the completion-based pipeline (`runCausalGraphPipeline`)
- The system SHALL NOT create a workspace directory
- Behavior SHALL be identical to the fast path

#### Scenario: Large session triggers Agent path

- **WHEN** `/eval` is run on a session with 800 steps
- **THEN** the system SHALL select the Agent-based focus pipeline
- **AND** SHALL create `~/.dscode/eval/{sessionId}/` with library/, notebook/, output/
- **AND** SHALL display Phase progress (Phase 0/4 → 1/4 → 2/4 → 3/4 → 4/4)

#### Scenario: Small session uses fast path

- **WHEN** `/eval` is run on a session with 200 steps
- **THEN** the system SHALL select `runCausalGraphPipeline`
- **AND** SHALL NOT create a workspace directory

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

The system SHALL construct `AgentNode[]` deterministically from `HistoryStep[]` and `Subtask[]` using `buildAgentNodes(steps, subtasks)` without calling an LLM. Agent node construction SHALL NOT fail for any valid input.

The system SHALL call an LLM for each subtask individually (divide-and-conquer) to extract step-level data flows. For each subtask, a dedicated prompt SHALL include:
- The target subtask's step range and detailed agent/action list
- Brief context of adjacent subtasks (IDs and step ranges) for cross-boundary data flow tracking
- Instruction to output `StepDataFlow[]` with data item tracking for that subtask ONLY

Each `AgentNode` SHALL contain: subtaskId, agent, otar (observation, thought, action, result), and stepIds (list of step indices this agent action covers). Agent nodes SHALL be constructed from `HistoryStep` fields directly without LLM summarization.

Each `StepDataFlow` SHALL contain: subtaskId, fromStep, toStep, sourceAgent, targetAgent, dataItem, dataType, transformation, correctness ("correct" | "misinterpreted" | "misused" | "fabricated"), and confidence (0.0-1.0).

`executeStep3` SHALL return `{ agents, dataFlows }` where agents come from `buildAgentNodes()` and dataFlows are aggregated from per-subtask LLM calls. If an individual subtask's LLM call fails, the subtask SHALL be skipped with a warning and processing SHALL continue.

When `onLog` callback is provided, the system SHALL call `onLog("🤖 Phase 3/6: 提取 Agent 节点...")` before processing and `onLog("✓ Phase 3/6 完成")` after successful completion.

#### Scenario: Agent node construction without LLM

- **WHEN** Step 1 has produced subtasks with valid step ranges and Step 2 has completed
- **THEN** agent nodes SHALL be built deterministically from `HistoryStep[]` without an LLM call
- **AND** each `AgentNode.otar` SHALL map directly from the corresponding `HistoryStep` fields

#### Scenario: Divide-and-conquer data flow extraction

- **WHEN** Step 1 produced N subtasks (e.g., N=8)
- **THEN** the system SHALL make N separate LLM calls, one per subtask, each with maxTokens=4096
- **AND** the aggregated `dataFlows` SHALL be the union of all successful per-subtask results

#### Scenario: Graceful degradation on per-subtask failure

- **WHEN** a single subtask's LLM call fails
- **THEN** the system SHALL log a warning identifying the failed subtask
- **AND** the system SHALL continue processing remaining subtasks

### Requirement: Step 4 — Agent Edges (LLM)

The system SHALL call an LLM to identify dependency edges between agents within each subtask. The LLM prompt SHALL include:
- Subtasks and their agent nodes
- Instruction to output agent edges with dependency type and failure modes

Each `AgentEdge` SHALL contain: subtask_id, source agent, target agent, dependency type (one of: "obs_dependency", "reasoning_continuation", "decision_dependency", "environment_feedback", "memory_ref", "loop_control"), strength, explanation, and failure_modes.

When `onLog` callback is provided, the system SHALL call `onLog("🔗 Phase 4/6: 识别 Agent 依赖边...")` before the LLM call and `onLog("✓ Phase 4/6 完成")` after successful completion.

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

The system SHALL call an LLM to determine the single root cause from the candidate set using four counterfactual rules:

**Rule 1 (Control Flow / Loop)**: If a loop is involved, determine whether the loop was justified. If not, attribute to the decision to enter the loop. If yes, attribute to the irreversible action within or after the loop.

**Rule 2 (Data Flow)**: Trace each key data item used in the final failure. If upstream data was misinterpreted → blame current executor. If data was fabricated without upstream source → blame generator. If data was correct but misused → blame misusing node.

**Rule 3 (Irrecoverable Point)**: Attribute to the FIRST node that made the correct path unrecoverable by normal means, not necessarily the first deviating node.

**Rule 4 (Taste / Creative Drift)**: Attribute to the step where the agent chose a generic, templated, or visually degraded approach instead of the distinctive, intentional, tasteful output dscode is designed to produce.

**Recovery Arc Detection**: After determining the root cause, the LLM SHALL also scan the session history for recovery arcs — instances where an error was detected and subsequently corrected by the agent. For each recovered error, the LLM SHALL identify the error event, detection event, correction event, and assess whether the correction was effective.

The LLM SHALL output an `Attribution` with: mistake_agent, mistake_step, reason, rules_applied (list of "Rule1"/"Rule2"/"Rule3"/"Rule4"), **rootCauseTitle** + **rootCauseSeverity** ("primary" | "secondary"), and optionally **recoveryArcs** (array of `RecoveryArc` objects).

Each `RecoveryArc` SHALL contain: errorStep, errorAgent, errorSummary, detectionStep, detectionType, correctionStep, correctionAgent, correctionSummary, effective, stepsToRecover, misdiagnosisCount.

When `onLog` callback is provided, the system SHALL call `onLog("⚖️ Phase 6/6: 反事实归因...")` before the LLM call and `onLog("✓ Phase 6/6 完成")` after successful completion.

#### Scenario: Root cause attributed via Rule 2

- **WHEN** a `read_file` call returned correct data but a subsequent `write_file` misinterpreted it
- **THEN** `mistake_agent` SHALL be "write_file"
- **AND** `rules_applied` SHALL include "Rule2"
- **AND** `reason` SHALL describe the data misinterpretation
- **AND** `rootCauseTitle` SHALL be a concise summary suitable for dashboard display

#### Scenario: Root cause attributed via Rule 3

- **WHEN** the earliest deviation was at step 12 but the first irreversible action was at step 18
- **THEN** `mistake_step` SHALL be 18
- **AND** `rules_applied` SHALL include "Rule3"
- **AND** `reason` SHALL explain why step 18 was the point of no return

#### Scenario: Attribution validation failure

- **WHEN** Step 6 LLM returns an agent name or step number not present in the session
- **THEN** the system SHALL retry with a correction hint
- **AND** if retry also fails, SHALL throw an error to the caller

#### Scenario: Recovery arcs present in attribution

- **WHEN** the session contains an error at step 5 that was corrected at step 8 after a test failure at step 6
- **THEN** `recoveryArcs` SHALL contain at least one `RecoveryArc`
- **AND** the arc SHALL have errorStep=5, detectionStep=6, correctionStep=8
- **AND** detectionType SHALL be "test_failure"

#### Scenario: No recovery arcs in session

- **WHEN** no errors in the session were corrected (e.g., all errors persist)
- **THEN** `recoveryArcs` SHALL be absent or an empty array

### Requirement: Structured Output Parsing

All LLM responses SHALL be parsed via `extractJSON(text)` to locate a JSON block, then validated against Zod schemas. Parse failures SHALL trigger at most one retry with a format correction hint. Two consecutive failures for any step SHALL throw an error to the caller.

### Requirement: Agent-Based Analysis Pipeline (Focus Path)

The system SHALL implement a three-pass Agent pipeline for large sessions (≥500 steps):

**Pass 1 — SCAN Agent**: 
- System prompt SHALL define the Agent as a session scanner
- Task prompt SHALL instruct the Agent to explore `library/` and identify 3-5 attention zones
- The Agent SHALL have access to `read_file`, `grep`, `glob`, `write_file` tools
- The Agent SHALL write structured output to `output/scan-result.json`
- The Agent MAY write analysis notes to `notebook/scan-notes.md`

**Pass 2 — ZOOM Agent** (one per attention zone):
- System prompt SHALL define the Agent as a causal graph analyst
- Task prompt SHALL instruct the Agent to deep-dive a specific zone's steps
- The Agent SHALL write structured output to `output/zone-{id}-result.json`

**Pass 3 — SYNTHESIZE Agent**:
- System prompt SHALL define the Agent as a cross-zone synthesizer
- The Agent SHALL write structured output to `output/attribution.json`

#### Scenario: Three-pass Agent pipeline execution

- **WHEN** `runFocusPipeline` is called for a large session
- **THEN** the system SHALL execute Pass 1 SCAN Agent, wait for completion, and parse `output/scan-result.json`
- **AND** for each zone, execute a Pass 2 ZOOM Agent
- **AND** after all zones, execute Pass 3 SYNTHESIZE Agent
- **AND** compose the final `EvalResult` from the structured outputs

### Requirement: Pipeline Output Consistency

The Agent-based focus pipeline SHALL produce `EvalResult` output that is structurally identical to the completion-based pipeline.

#### Scenario: Agent pipeline produces valid EvalResult

- **WHEN** the Agent-based pipeline completes successfully
- **THEN** `composeEvalResult` SHALL produce an `EvalResult` with all required fields
- **AND** the result SHALL pass the same validation as the completion-based pipeline

### Requirement: Pipeline Fallback on Agent Failure

The system SHALL return a partial EvalResult with `agentFailed: true` annotation if the Agent-based pipeline encounters an unrecoverable error. The system SHALL NOT throw — it SHALL always return a valid EvalResult structure.

#### Scenario: Workspace creation fails

- **WHEN** the system cannot create `~/.dscode/eval/{sessionId}/` (e.g., disk full, permission denied)
- **THEN** the system SHALL log a warning
- **AND** SHALL fall back to `runCausalGraphPipeline` if session <500 steps; if ≥500 steps, return a partial EvalResult with `agentFailed: true`

#### Scenario: All Agent passes exceed maxToolCalls

- **WHEN** all three Agent passes fail to produce valid output
- **THEN** the system SHALL return a partial EvalResult with `agentFailed: true`
- **AND** the dashboard SHALL display "Agent 分析失败（已返回部分结果）"

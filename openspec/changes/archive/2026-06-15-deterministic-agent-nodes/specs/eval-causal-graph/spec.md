## MODIFIED Requirements

### Requirement: Step 3 — Agent Nodes and Step Data Flows (LLM)

The system SHALL construct `AgentNode[]` deterministically from `HistoryStep[]` and `Subtask[]` using `buildAgentNodes(steps, subtasks)` without calling an LLM. Agent node construction SHALL NOT fail for any valid input.

The system SHALL call an LLM for each subtask individually (divide-and-conquer) to extract step-level data flows. For each subtask, a dedicated prompt SHALL include:
- The target subtask's step range and detailed agent/action list
- Brief context of adjacent subtasks (IDs and step ranges) for cross-boundary data flow tracking
- Instruction to output `StepDataFlow[]` with data item tracking for that subtask ONLY

The LLM prompt SHALL NOT include full history step details for agent node extraction.

Each `AgentNode` SHALL contain: subtaskId, agent, otar (observation, thought, action, result), and stepIds (list of step indices this agent action covers). Agent nodes SHALL be constructed from `HistoryStep` fields directly without LLM summarization.

Each `StepDataFlow` SHALL contain: subtaskId, fromStep, toStep, sourceAgent, targetAgent, dataItem, dataType, transformation, correctness ("correct" | "misinterpreted" | "misused" | "fabricated"), and confidence (0.0-1.0).

`executeStep3` SHALL return `{ agents, dataFlows }` where agents come from `buildAgentNodes()` and dataFlows are aggregated from per-subtask LLM calls. If an individual subtask's LLM call fails (no JSON, parse failure, or validation failure), the subtask SHALL be skipped with a warning and processing SHALL continue to remaining subtasks. A summary warning SHALL be logged if any subtasks failed.

#### Scenario: Agent node construction without LLM

- **WHEN** Step 1 has produced subtasks with valid step ranges and Step 2 has completed
- **THEN** agent nodes SHALL be built deterministically from `HistoryStep[]` without an LLM call
- **AND** each `AgentNode.otar` SHALL map directly from the corresponding `HistoryStep` fields
- **AND** the operation SHALL complete successfully for any valid input

#### Scenario: Data flow extraction with LLM

- **WHEN** subtasks and history step summaries are provided
- **THEN** the LLM SHALL output only `StepDataFlow[]` for the requested subtask (no agent nodes)
- **AND** each `StepDataFlow` SHALL contain fromStep, toStep, dataItem, and correctness

#### Scenario: Divide-and-conquer data flow extraction

- **WHEN** Step 1 produced N subtasks (e.g., N=8)
- **THEN** the system SHALL make N separate LLM calls, one per subtask, each with maxTokens=4096
- **AND** each call's prompt SHALL contain only that subtask's step details
- **AND** the aggregated `dataFlows` SHALL be the union of all successful per-subtask results

#### Scenario: Graceful degradation on per-subtask failure

- **WHEN** a single subtask's LLM call fails (e.g., no JSON found, parse error, or validation failure)
- **THEN** the system SHALL log a warning identifying the failed subtask
- **AND** the system SHALL continue processing remaining subtasks
- **AND** `executeStep3` SHALL still succeed, returning dataFlows from all successful subtasks

#### Scenario: OTAR extraction for tool-call session

- **WHEN** the session has clear thinking→toolCall→toolResult sequences
- **THEN** each `AgentNode.otar` SHALL map thinking→thought, toolCall→action, toolResult→result
- **AND** `agent` SHALL be the tool name

#### Scenario: Data flow between steps

- **WHEN** step 5 reads a file and step 8 modifies the same file
- **THEN** a `StepDataFlow` SHALL be created with fromStep=5, toStep=8
- **AND** `dataItem` SHALL be the file path
- **AND** `correctness` SHALL be "correct" if the file content was used correctly

## REMOVED Requirements

None.

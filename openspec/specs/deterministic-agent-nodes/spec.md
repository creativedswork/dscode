## ADDED Requirements

### Requirement: Deterministic Agent Node Construction

The system SHALL construct `AgentNode[]` deterministically from `HistoryStep[]` and `Subtask[]` without calling an LLM. The `buildAgentNodes(steps, subtasks)` function SHALL be a pure, synchronous function.

For each subtask, the system SHALL iterate over `stepId` from `subtask.stepStart` to `subtask.stepEnd` (inclusive), and for each corresponding `HistoryStep`, construct one `AgentNode`:
- `subtaskId` = subtask.id
- `agent` = step.agent
- `otar.observation` = step.observation
- `otar.thought` = step.thought
- `otar.action` = step.action
- `otar.result` = step.result
- `stepIds` = [step.stepId]

The system SHALL NOT call an LLM for agent node construction. The function SHALL NOT throw under any valid input (zero steps, empty subtasks, etc. — all handled by returning empty arrays or skipping gracefully).

#### Scenario: Build agent nodes from valid steps

- **WHEN** `steps` contains 5 entries and `subtasks` contains one subtask covering steps 0-4
- **THEN** `buildAgentNodes` SHALL return 5 `AgentNode` entries
- **AND** each entry's `subtaskId` SHALL equal the subtask's id
- **AND** each entry's `otar` SHALL map directly from the corresponding `HistoryStep`

#### Scenario: Empty input

- **WHEN** `steps` is empty or `subtasks` is empty
- **THEN** `buildAgentNodes` SHALL return an empty array without throwing

#### Scenario: Subtask range with no matching steps

- **WHEN** a subtask's `stepStart` is beyond the length of `steps`
- **THEN** `buildAgentNodes` SHALL skip that subtask and continue without throwing

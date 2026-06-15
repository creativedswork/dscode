## MODIFIED Requirements

### Requirement: Step 1 — Subtask Decomposition (LLM)

The system SHALL call an LLM to decompose the session into a sequence of subtasks. The LLM prompt SHALL include:
- The session question/title
- A summary of history steps (stepId, agent, action, thought first 100 chars)
- Instruction to output subtasks with: name, step range (inclusive), oracle (goal + preconditions + key evidence + acceptance criteria), loop info (is_loop_related, loop_role, reversibility, risk_score), and **phaseStatus** ("ok" | "warn" | "danger" — derived from error/complaint presence in the subtask's step range)

The LLM output SHALL be parsed as JSON and validated against the `Subtask[]` schema. Each subtask SHALL have a unique ID ("S1", "S2", ...). Step ranges MUST cover all steps from 0 to N-1, be non-overlapping, and be contiguous. The subtask array SHALL serve as the **sole source** of phase information for the eval dashboard — there is no longer a separate rule-engine phase detection.

The oracle field SHALL be structured as `{ goal, preconditions[], key_evidence[], acceptance_criteria[] }`.

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
- **AND** if retry also fails, SHALL throw an error to the caller (no fallback to rule-engine analysis)

### Requirement: Step 5 — Candidate Error Set (LLM)

The system SHALL call an LLM to generate a candidate error set from the causal graph. The LLM prompt SHALL include:
- The complete causal graph snapshot (subtasks, edges, agents, data flows)
- The original question and history summary
- Instruction to output at least 5 candidate error steps

Each `CandidateStep` SHALL contain: step_id, agents_in_step, in_loop, loop_role, data_issue, data_item, source_step, irrecoverable, irrecoverable_reason, affected_steps, impact_score, confidence, and **deviationDescription** (a human-readable description of what went wrong at this step, suitable for display in the dashboard deviations section).

The system SHALL enforce that the candidate set contains at least 5 steps. If the LLM returns fewer, the system SHALL retry with a "need at least 5 candidates" hint.

The candidate error set SHALL serve as the **sole source** of deviation information for the eval dashboard — there is no longer a separate Jaccard-distance-based deviation detection.

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

The LLM SHALL output an `Attribution` with: mistake_agent, mistake_step, reason, rules_applied, and **rootCauseTitle** + **rootCauseSeverity** ("primary" | "secondary"). The attribution SHALL serve as the **sole source** of root cause information — there is no longer a separate rule-engine `inferRootCauses()`.

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
- **AND** if retry also fails, SHALL throw an error to the caller (no fallback to highest-impact candidate)

## REMOVED Requirements

### Requirement: Causal Graph Assembly (deterministic)

**Reason**: Graph assembly via `CausalGraphStore` is preserved as a data structure, but the fallback behavior when `isGraphComplete()` returns false (falling back to rule-engine analysis) is removed. If the graph is incomplete, the pipeline throws an error.

**Migration**: `isGraphComplete()` returning false now throws instead of silently degrading.

### Requirement: Structured Output Parsing

**Reason**: The requirement that "two consecutive failures for any step SHALL cause fallback to rule-engine analysis" is removed. Two consecutive failures now throw an error to the caller. JSON parsing and retry logic is preserved.

**Migration**: Update `callLLMWithRetry` to throw on exhaustion instead of returning to a fallback path.

### Requirement: Session Parsing to History Steps

**Reason**: `parseSessionToSteps()` is preserved. This removal is specifically for the old requirement text referencing fallback behavior that no longer exists.

**Migration**: No code changes to `parseSessionToSteps()`. Only the spec language is updated.

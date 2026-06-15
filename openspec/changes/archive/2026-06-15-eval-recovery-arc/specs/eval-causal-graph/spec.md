# eval-causal-graph Delta Specification

## MODIFIED Requirements

### Requirement: Step 6 — Counterfactual Root Cause Attribution (LLM)

The system SHALL call an LLM to determine the single root cause from the candidate set using four counterfactual rules:

**Rule 1 (Control Flow / Loop)**: If a loop is involved, determine whether the loop was justified. If not, attribute to the decision to enter the loop. If yes, attribute to the irreversible action within or after the loop.

**Rule 2 (Data Flow)**: Trace each key data item used in the final failure. If upstream data was misinterpreted → blame current executor. If data was fabricated without upstream source → blame generator. If data was correct but misused → blame misusing node.

**Rule 3 (Irrecoverable Point)**: Attribute to the FIRST node that made the correct path unrecoverable by normal means, not necessarily the first deviating node.

**Rule 4 (Taste / Creative Drift)**: Attribute to the step where creative direction was compromised, resulting in generic, templated, or visually degraded output.

**Recovery Arc Detection**: After determining the root cause, the LLM SHALL also scan the session history for recovery arcs — instances where an error was detected and subsequently corrected by the agent. For each recovered error, the LLM SHALL identify the error event, detection event, correction event, and assess whether the correction was effective.

The LLM SHALL output an `Attribution` with: `mistakeAgent`, `mistakeStep`, `reason`, `rulesApplied` (list of "Rule1"/"Rule2"/"Rule3"/"Rule4"), and optionally `recoveryArcs` (array of `RecoveryArc` objects).

Each `RecoveryArc` SHALL contain: `errorStep`, `errorAgent`, `errorSummary`, `detectionStep`, `detectionType`, `correctionStep`, `correctionAgent`, `correctionSummary`, `effective`, `stepsToRecover`, `misdiagnosisCount`.

#### Scenario: Root cause attributed via Rule 2

- **WHEN** a `read_file` call returned correct data but a subsequent `write_file` misinterpreted it
- **THEN** `mistakeAgent` SHALL be "write_file"
- **AND** `rulesApplied` SHALL include "Rule2"
- **AND** `reason` SHALL describe the data misinterpretation

#### Scenario: Root cause attributed via Rule 3

- **WHEN** the earliest deviation was at step 12 but the first irreversible action was at step 18
- **THEN** `mistakeStep` SHALL be 18
- **AND** `rulesApplied` SHALL include "Rule3"
- **AND** `reason` SHALL explain why step 18 was the point of no return

#### Scenario: Attribution validation failure

- **WHEN** Step 6 LLM returns an agent name or step number not present in the session
- **THEN** the system SHALL retry with a correction hint
- **AND** if retry also fails, SHALL fall back to the highest-impact candidate from Step 5

#### Scenario: Recovery arcs present in attribution

- **WHEN** the session contains an error at step 5 that was corrected at step 8 after a test failure at step 6
- **THEN** `recoveryArcs` SHALL contain at least one `RecoveryArc`
- **AND** the arc SHALL have errorStep=5, detectionStep=6, correctionStep=8
- **AND** detectionType SHALL be "test_failure"

#### Scenario: No recovery arcs in session

- **WHEN** no errors in the session were corrected (e.g., all errors persist)
- **THEN** `recoveryArcs` SHALL be absent or an empty array
- **AND** the attribution SHALL still be valid

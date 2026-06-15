# eval-recovery-arc Specification

## Purpose

在 eval 归因中追踪 Agent 从犯错到纠正的完整恢复弧线（Recovery Arc），包括错误事件定位、检测事件识别、纠正事件定位、纠正有效性评估、误判次数统计、恢复耗时。

## ADDED Requirements

### Requirement: RecoveryArc Data Structure

The system SHALL define a `RecoveryArc` type with the following fields:

- `errorStep: number` — step ID where the error was committed
- `errorAgent: string` — tool name that made the error
- `errorSummary: string` — brief description of the error
- `detectionStep: number` — step ID where the error was first detected
- `detectionType: "tool_error" | "user_complaint" | "test_failure" | "screenshot_divergence" | "self_correction"` — how the error was discovered
- `correctionStep: number` — step ID where the correction was applied
- `correctionAgent: string` — tool name that applied the correction
- `correctionSummary: string` — brief description of the correction action
- `effective: boolean` — whether the correction successfully resolved the error
- `stepsToRecover: number` — number of steps from error to correction
- `misdiagnosisCount: number` — number of incorrect fix attempts before the correct one
- `rootCauseHypothesis: string` — inference of WHY the initial error happened, derived from how it was eventually corrected

#### Scenario: Complete recovery arc

- **WHEN** a session has an error at step 5 (write_file wrote incorrect content), detected at step 6 (bash test failed), and corrected at step 8 (edit fixed the content)
- **THEN** a `RecoveryArc` SHALL have errorStep=5, detectionStep=6, correctionStep=8
- **AND** detectionType SHALL be "test_failure"
- **AND** effective SHALL be true if the test passed after correction

#### Scenario: Recovery arc with misdiagnosis

- **WHEN** an error occurs at step 5, the agent makes 2 incorrect fix attempts at steps 7 and 9 before the correct fix at step 11
- **THEN** misdiagnosisCount SHALL be 2
- **AND** correctionStep SHALL be 11
- **AND** stepsToRecover SHALL be 6

#### Scenario: Self-corrected error

- **WHEN** the agent makes an error at step 5 and immediately fixes it at step 6 without external feedback
- **THEN** detectionType SHALL be "self_correction"
- **AND** detectionStep SHALL equal correctionStep OR be the step immediately before

#### Scenario: Ineffective correction

- **WHEN** the agent applies a correction at step 8 but the issue persists or recurs at step 12
- **THEN** effective SHALL be false
- **AND** a separate `RecoveryArc` MAY exist for the subsequent correction

#### Scenario: rootCauseHypothesis derived from correction path

- **WHEN** a recovery arc has correction that involved re-reading a file before editing
- **THEN** `rootCauseHypothesis` SHALL explain that the initial error was caused by writing without understanding (write-before-read pattern)
- **AND** the hypothesis SHALL reference the correction evidence (e.g., "evidence: correction required read_file before edit")

### Requirement: RecoveryArc Validation

The system SHALL validate each `RecoveryArc` before accepting it into the result:

- `errorStep` MUST be < `correctionStep`
- `stepsToRecover` MUST equal `correctionStep - errorStep` (validated on parse, corrected if mismatched)
- `errorAgent` and `correctionAgent` MUST be non-empty strings
- `detectionType` MUST be one of the five valid values
- `misdiagnosisCount` MUST be >= 0

#### Scenario: Invalid recovery arc filtered

- **WHEN** an LLM returns a recoveryArc with errorStep=10 and correctionStep=3
- **THEN** the validation SHALL reject or correct the arc
- **AND** SHALL NOT crash the pipeline

#### Scenario: Missing optional field defaults

- **WHEN** an LLM returns a recoveryArc without `misdiagnosisCount`
- **THEN** `misdiagnosisCount` SHALL default to 0
- **AND** the arc SHALL still be accepted

### Requirement: Attribution Schema Extended

The `Attribution` type SHALL be extended with an optional `recoveryArcs` field:

```typescript
interface Attribution {
  // ... existing fields ...
  recoveryArcs?: RecoveryArc[];
}
```

The `FocusAttribution` type SHALL be extended with an optional `recoveryArcs` field:

```typescript
interface FocusAttribution {
  // ... existing fields ...
  recoveryArcs?: RecoveryArc[];
}
```

#### Scenario: Attribution without recovery arcs (backward compat)

- **WHEN** Step 6 LLM returns an Attribution without `recoveryArcs`
- **THEN** the pipeline SHALL accept the result
- **AND** `recoveryArcs` SHALL be undefined

#### Scenario: Attribution with empty recovery arcs

- **WHEN** Step 6 LLM returns `"recoveryArcs": []`
- **THEN** the pipeline SHALL accept the result
- **AND** no recovery timeline SHALL be displayed

### Requirement: EvalResult Carries Recovery Arcs

The `EvalResult` type SHALL include an optional `recoveryArcs` field that carries validated recovery arcs to the dashboard.

#### Scenario: Recovery arcs flow to dashboard

- **WHEN** a CHIFF or Focus pipeline produces recovery arcs
- **THEN** `EvalResult.recoveryArcs` SHALL contain the validated arcs
- **AND** the dashboard SHALL have access to them for rendering

### Requirement: CHIFF Step 6 Prompt Includes Recovery Arc Detection

The Step 6 (Counterfactual Attribution) LLM prompt SHALL include a "RECOVERY ARC DETECTION" section instructing the LLM to:

1. After determining the root cause, scan the session history for evidence of recovery from each candidate error
2. For each error that was eventually corrected, identify the detection event and correction event
3. Assess whether the correction was effective
4. **Output `rootCauseHypothesis`**: For each recovery arc, infer why the initial error happened based on how it was corrected (e.g., "correction required re-reading the file → the agent didn't understand the target before writing")
5. Output `recoveryArcs` as an array in the JSON response, each with `rootCauseHypothesis`

#### Scenario: Step 6 prompt includes recovery arc instructions

- **WHEN** Step 6 LLM is called
- **THEN** the prompt SHALL contain recovery arc detection instructions
- **AND** the expected JSON output SHALL include an optional `recoveryArcs` field with `rootCauseHypothesis` in each arc

### Requirement: Step 7 Receives Recovery Arcs as Evidence

The Step 7 (LLM autonomous rule attribution) prompt SHALL receive `recoveryArcs` as additional input context. The recovery arcs SHALL be summarized as:
- Error agent, step, detection type, correction agent, steps to recover, misdiagnosis count
- rootCauseHypothesis for each arc

The LLM SHALL use recovery patterns to generate Harness Rules. For example:
- `misdiagnosisCount >= 2` → suggest rule about diagnose-before-fix workflow
- `detectionType === "user_complaint"` → suggest rule about perception/taste self-check
- `rootCauseHypothesis` mentions "didn't read" → suggest rule about read-before-write requirement

#### Scenario: Step 7 receives recovery arcs

- **WHEN** Step 7 LLM is called after a successful Step 6 with recovery arcs
- **THEN** the prompt SHALL include a "RECOVERY ARCS" section with arc summaries and rootCauseHypotheses
- **AND** the LLM MAY generate Harness Rules based on recovery patterns

#### Scenario: Step 7 without recovery arcs (backward compat)

- **WHEN** Step 7 LLM is called but no recovery arcs are available
- **THEN** the prompt SHALL omit the recovery arcs section
- **AND** Harness Rule generation SHALL proceed normally

### Requirement: Focus Synthesize Prompt Includes Recovery Arc Detection

The Pass 3 (Synthesize) LLM prompt SHALL include a "RECOVERY ARC DETECTION" section with equivalent instructions to Step 6, adapted for cross-zone recovery arc identification.

#### Scenario: Synthesize prompt includes recovery arc instructions

- **WHEN** Pass 3 LLM is called
- **THEN** the prompt SHALL contain recovery arc detection instructions
- **AND** the expected JSON output SHALL include an optional `recoveryArcs` field

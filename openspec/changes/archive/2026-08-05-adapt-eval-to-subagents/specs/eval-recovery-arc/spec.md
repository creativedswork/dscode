## MODIFIED Requirements

### Requirement: RecoveryArc Data Structure

The system SHALL define each Recovery Arc with real error and correction Actor identities:

- `errorStep: number`
- `errorAgentId: string`
- `errorApplication: string`
- `errorSummary: string`
- `detectionStep: number`
- `detectionType: "tool_error" | "user_complaint" | "test_failure" | "screenshot_divergence" | "self_correction" | "agent_review"`
- `correctionStep: number`
- `correctionAgentId: string`
- `correctionApplication: string`
- `correctionSummary: string`
- `effective: boolean`
- `stepsToRecover: number`
- `misdiagnosisCount: number`
- `rootCauseHypothesis: string`

Tool names MAY appear in summaries but SHALL not populate Agent identity fields. Error and correction Actors MAY be different processes or Applications.

#### Scenario: Cross-Agent recovery

- **WHEN** Explorer X makes an error at Step 5 and Reviewer Y corrects it at Step 11
- **THEN** the arc SHALL identify X/Explorer as the error Actor
- **AND** SHALL identify Y/Reviewer as the correction Actor
- **AND** `stepsToRecover` SHALL be 6

#### Scenario: Same-Agent self-correction

- **WHEN** one Agent detects and corrects its own error
- **THEN** error and correction Agent IDs MAY be equal
- **AND** detection type SHALL be `self_correction` when no external signal caused detection

#### Scenario: Agent review detection

- **WHEN** a Reviewer Agent identifies another Agent's latent error before a tool/test failure
- **THEN** `detectionType` SHALL be `agent_review`

### Requirement: RecoveryArc Validation

The system SHALL validate Recovery Arcs against the normalized trajectory:

- error/detection/correction Steps MUST reference existing Steps
- error Step MUST precede correction Step in stable order
- error/correction Agent IDs MUST match the actors of their Steps
- Applications MUST match the referenced trajectory actors
- `stepsToRecover` MUST equal `correctionStep - errorStep`
- detection type MUST be valid
- misdiagnosis count MUST be non-negative

Invalid arcs SHALL be filtered or normalized without crashing the Pipeline and SHALL produce a validation diagnostic.

#### Scenario: Agent-Step mismatch

- **WHEN** an arc references Explorer X as error Actor but its `errorStep` belongs to Main
- **THEN** validation SHALL reject the arc
- **AND** SHALL not silently rewrite the Actor to a tool name

#### Scenario: Correct recover distance

- **WHEN** an otherwise valid arc reports an incorrect `stepsToRecover`
- **THEN** validation SHALL normalize it from Step IDs

### Requirement: Attribution Schema Extended

The unified CHIEF `Attribution` SHALL carry optional validated `recoveryArcs`. The separate Focus attribution type SHALL no longer be required.

#### Scenario: Attribution without recovery

- **WHEN** no candidate error is later corrected
- **THEN** `recoveryArcs` SHALL be absent or empty
- **AND** attribution SHALL remain valid

#### Scenario: Attribution with cross-Agent recovery

- **WHEN** one or more valid cross-Agent arcs are detected
- **THEN** the Attribution SHALL retain their full Actor identities

### Requirement: EvalResult Carries Recovery Arcs

`EvalResult` SHALL carry validated cross-Agent Recovery Arcs to the Dashboard and Harness Rule attribution stage without replacing full Agent IDs with visible short IDs.

#### Scenario: Recovery data reaches both consumers

- **WHEN** CHIEF attribution returns a valid Recovery Arc
- **THEN** Dashboard rendering and rule attribution SHALL receive equivalent Arc data
- **AND** visible rendering SHALL shorten IDs only at presentation time

### Requirement: CHIFF Step 6 Prompt Includes Recovery Arc Detection

The `chief-attribution` Application SHALL detect Recovery Arcs after choosing the root cause. It SHALL inspect later Steps across all real Actors, determine detection and correction events, assess effectiveness, and infer a root-cause hypothesis from the correction path.

Deviation-Aware screening SHALL use effective Recovery Arcs to distinguish transient, fully corrected deviations from irreversible or late-corrected failures.

#### Scenario: Cross-Agent prompt context

- **WHEN** attribution input contains Explorer, Main, and Reviewer Steps
- **THEN** recovery analysis SHALL consider corrections performed by any of those Actors
- **AND** SHALL output real Agent IDs and Applications

#### Scenario: Late correction remains evidence

- **WHEN** an error is corrected only after it already caused downstream failure
- **THEN** the Arc SHALL record an effective correction
- **AND** Final Screening SHALL not automatically erase the original responsibility

### Requirement: Step 7 Receives Recovery Arcs as Evidence

The `eval-rule-attribution` worker SHALL receive cross-Agent Recovery Arcs including error/correction Agent IDs, Applications, Step IDs, detection type, effectiveness, recovery distance, misdiagnosis count, and root-cause hypothesis.

#### Scenario: Different error and correction Applications

- **WHEN** Explorer causes an error and Reviewer repairs it
- **THEN** rule evidence SHALL retain both Applications
- **AND** an Application-specific suggestion SHALL target the responsible layer justified by the Arc

#### Scenario: No Recovery Arcs

- **WHEN** attribution contains no Recovery Arcs
- **THEN** rule attribution SHALL proceed without a recovery section

## REMOVED Requirements

### Requirement: Focus Synthesize Prompt Includes Recovery Arc Detection

**Reason**: The separate Focus/Synthesize Pipeline is replaced by one unified CHIEF attribution worker.

**Migration**: Detect all Recovery Arcs in `chief-attribution` after Oracle-guided backtracking.

## RENAMED Requirements

- FROM: `CHIFF Step 6 Prompt Includes Recovery Arc Detection`
- TO: `CHIEF Attribution Worker Includes Cross-Agent Recovery Detection`

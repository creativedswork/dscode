# harness-rule-extraction Specification

## Purpose

Deterministic rule extraction engine that maps the CHIFF causal graph, attribution, and session statistics to `HarnessRule` objects from the pre-defined catalog. Runs as Step 7 of the eval pipeline.

## ADDED Requirements

### Requirement: Rule extraction from CHIFF causal graph

The system SHALL implement a `extractRules` function that takes a `CausalGraphStore` snapshot, an `Attribution`, and session statistics, and produces a `HarnessRule[]` array. The function SHALL execute each registered detector against the session data and return all triggered rules.

#### Scenario: Detector triggers a rule

- **WHEN** a session has `bash_file_ops / total_bash_calls > 0.4`
- **THEN** the `bashFileOpRatio` detector SHALL return a value above its threshold
- **AND** `extractRules` SHALL include rule `R_BASH_OVERUSE` in the output

#### Scenario: Detector does not trigger

- **WHEN** a session has `bash_file_ops / total_bash_calls = 0.05`
- **THEN** the `bashFileOpRatio` detector SHALL return a value below its threshold
- **AND** `extractRules` SHALL NOT include rule `R_BASH_OVERUSE` in the output

### Requirement: Step 7 — Rule abstraction from attribution

The system SHALL add a Step 7 to the CHIFF pipeline that maps the Step 6 `Attribution` (root cause agent + step) to one or more `HarnessRule` IDs. The mapping SHALL be deterministic, not LLM-based, for all rules in the pre-defined catalog that are linked to CHIFF failure modes.

The mapping SHALL consider:
- `attribution.mistakeAgent` → rules about that tool's usage patterns
- `attribution.rulesApplied` → rules about the corresponding CHIFF failure mode (Rule1=loop→R_FIX_CASCADE, Rule2=data→R_DATA_MISINTERPRET, Rule3=irrecoverable→R_IRRECOVERABLE_ACTION, Rule4=taste→R_TASTE_DEGRADED)

#### Scenario: CHIFF Rule 3 maps to irrecoverable action rule

- **WHEN** attribution has `rulesApplied: ["Rule3"]` and `mistakeAgent: "write_file"`
- **THEN** Step 7 SHALL trigger `R_IRRECOVERABLE_ACTION` with the `write_file` tool context
- **AND** the rule evidence SHALL include `attribution.mistakeStep` as a sample step

#### Scenario: CHIFF Rule 2 maps to data misinterpret rule

- **WHEN** attribution has `rulesApplied: ["Rule2"]` and a data flow in the causal graph shows `correctness: "misinterpreted"`
- **THEN** Step 7 SHALL trigger `R_DATA_MISINTERPRET`
- **AND** `sampleSteps` SHALL include both the source step and the mistaken consumer step

### Requirement: De-concretization of session-specific details

The system SHALL strip session-specific identifiers from rule evidence before storing. File paths, specific step numbers, and tool argument values in `sampleSteps` SHALL be preserved for traceability, but the rule's `abstract` and `suggestion` SHALL NOT reference specific file paths, session IDs, or user messages.

#### Scenario: Abstract rule from concrete session event

- **WHEN** a session contains "`write_file(path='src/config.ts')` at step 12 caused irrecoverable config corruption"
- **THEN** the extracted rule's `abstract` SHALL read "write_file operations without prior read_file validation can cause irrecoverable state"
- **AND** the rule `id` SHALL be `R_IRRECOVERABLE_WRITE` (a stable catalog ID)
- **AND** `evidence[].sampleSteps` SHALL include `[12]` for traceability

### Requirement: LLM-assisted rule extraction for identity/taste rules

For rules with `needs_llm: true` (primarily `identity` and `taste` category rules), the system SHALL call an LLM with a prompt that includes:
- The session's user messages and agent responses
- The current Identity and Soul sections of the system prompt
- Instruction to determine whether the agent's output is consistent with the Identity/Soul declarations

The LLM SHALL output a structured JSON with `triggered: boolean` and `reasoning: string`. The system SHALL use this to decide whether to add evidence to the corresponding `identity` rules.

#### Scenario: LLM detects identity drift

- **WHEN** the agent's output in a session lacks editorial voice and reads like a generic coding bot
- **THEN** the LLM SHALL return `{ triggered: true, reasoning: "..." }`
- **AND** the system SHALL add evidence to `R_IDENTITY_DRIFT`

#### Scenario: LLM confirms identity is present

- **WHEN** the agent's output demonstrates "think like an editor, design like an art director" characteristics
- **THEN** the LLM SHALL return `{ triggered: false }`
- **AND** no evidence SHALL be added to `R_IDENTITY_DRIFT`

### Requirement: Extraction runs after CHIFF pipeline, before dashboard

The `runCausalGraphPipeline` function SHALL call `extractRules` after Step 6 completes successfully. On rule-engine fallback, `extractRules` SHALL still execute (rule engine produces sufficient statistics for most detectors). The extracted rules SHALL be included in `EvalResult.rules`.

#### Scenario: Rules extracted after successful CHIFF pipeline

- **WHEN** CHIFF Steps 1-6 all complete successfully
- **THEN** `extractRules` SHALL be called with the causal graph snapshot and attribution
- **AND** `EvalResult.rules` SHALL contain all triggered rules

#### Scenario: Rules extracted on rule-engine fallback

- **WHEN** CHIFF pipeline falls back to rule-engine analysis
- **THEN** `extractRules` SHALL still be called with session statistics
- **AND** `EvalResult.rules` SHALL contain rules that can be detected without LLM attribution
- **AND** `EvalResult.analysisMode` SHALL remain `"rule"`

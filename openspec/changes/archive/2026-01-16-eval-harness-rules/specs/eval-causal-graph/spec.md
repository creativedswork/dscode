## ADDED Requirements

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

## MODIFIED Requirements

### Requirement: Progress Reporting

The system SHALL report progress to the UI during the 8-step analysis pipeline. Each step (0-8) SHALL display a message: "Step X/8: <step_description>...". Step 0 (deterministic parsing and stats) SHALL complete immediately and display initial statistics. Steps 1-6 SHALL be LLM calls (with retry). Steps 7-8 SHALL be deterministic (no LLM). Steps 7-8 SHALL NOT report individual progress messages (they complete near-instantly).

#### Scenario: Progress during analysis

- **WHEN** `/eval` is invoked on a valid session
- **THEN** the UI SHALL show "正在解析 session..." for Step 0
- **AND** then "Step 1/8: 分解子任务..." through "Step 6/8: 反事实根因裁决..."
- **AND** Steps 7-8 SHALL complete silently (no separate progress message needed)

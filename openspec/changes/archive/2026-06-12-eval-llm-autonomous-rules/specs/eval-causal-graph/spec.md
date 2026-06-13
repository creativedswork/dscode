## MODIFIED Requirements

### Requirement: Step 7 — Rule Abstraction (LLM-based, replaces deterministic)

After Step 6 attribution is complete, the system SHALL execute Step 7: Rule Attribution. This step SHALL be LLM-based and SHALL provide the full CHIFF context (causal graph snapshot, data flows with correctness anomalies, candidate error set, attribution) plus session key fragments and current Agent configuration to the LLM, as specified in `eval-llm-rule-attribution`.

The step SHALL NOT use any pre-defined rule catalog, detector registry, or CHIFF→Rule mapping. The LLM autonomously identifies which Agent configuration layers need improvement and generates structured `HarnessRule` objects.

#### Scenario: Step 7 runs after successful Step 6

- **WHEN** CHIFF Steps 1-6 complete successfully and produce an `Attribution`
- **THEN** Step 7 SHALL call the LLM with the full CHIFF context
- **AND** produce a `HarnessRule[]` array generated autonomously by the LLM
- **AND** the LLM SHALL output rules targeting specific Agent configuration layers

#### Scenario: Step 7 runs on rule-engine fallback

- **WHEN** the pipeline falls back to rule-engine mode before Step 6
- **THEN** Step 7 SHALL still call the LLM with session statistics and key fragments (no causal graph)
- **AND** SHALL produce rules based on observable session patterns
- **AND** the LLM SHALL NOT have access to attribution data

### Requirement: Step 8 — Semantic Rule Merge (LLM-based, replaces deterministic)

After Step 7 extraction, the system SHALL execute Step 8: Semantic Rule Merge. This step SHALL load the existing `RuleStore` from `~/.dscode/eval/rules.json`, call the LLM for semantic matching between new and existing rules, apply the merge decisions, and save the merged result back to the store. This step SHALL use LLM-based semantic matching as specified in `eval-semantic-rule-merge`.

#### Scenario: New rules semantically merged with existing store

- **WHEN** Step 7 produces 3 new rules and the store has 5 existing rules, some of which describe the same problems
- **THEN** the LLM SHALL output merge decisions for all 3 new rules
- **AND** semantically matching rules SHALL be merged (evidence appended, severity recalculated)
- **AND** non-matching rules SHALL be added as new entries
- **AND** the merged store SHALL be written to `rules.json`

#### Scenario: No new rules triggered

- **WHEN** Step 7 produces an empty `HarnessRule[]`
- **THEN** Step 8 SHALL skip the LLM call
- **AND** SHALL still load and save the store (preserving existing rules)
- **AND** no rules SHALL be added or modified

### Requirement: EvalResult uses LLM-generated rules

The `EvalResult` interface SHALL include `rules: HarnessRule[]` where each `HarnessRule` conforms to the simplified type (no `pattern`, no `needsLlm`). The `mergePipelineResults` function SHALL populate `EvalResult.rules` from the merged Rule Store after Step 8. The output SHALL include all rules currently in the store (both newly triggered and pre-existing), allowing the dashboard to show the complete rule state.

#### Scenario: EvalResult contains LLM-generated rules after pipeline

- **WHEN** `runCausalGraphPipeline` completes successfully with LLM-based Steps 7-8
- **THEN** `EvalResult.rules` SHALL be a `HarnessRule[]`
- **AND** each rule's `id`, `abstract`, `rawDescription`, and `suggestion` SHALL be LLM-generated
- **AND** no rule SHALL have `pattern` or `needsLlm` fields
- **AND** rules SHALL include both newly triggered and pre-existing rules from the store

#### Scenario: EvalResult on fallback contains rules

- **WHEN** the pipeline falls back to rule engine
- **THEN** `EvalResult.rules` SHALL still be populated from the merged store
- **AND** `EvalResult.analysisMode` SHALL remain `"rule"`

### Requirement: Progress Reporting

The system SHALL report progress to the UI during the 8-step analysis pipeline. Each step (0-8) SHALL display a message: "Step X/8: <step_description>...". Step 0 (deterministic parsing and stats) SHALL complete immediately and display initial statistics. Steps 1-6 SHALL be LLM calls (with retry). Steps 7-8 SHALL be LLM calls.

#### Scenario: Progress during analysis

- **WHEN** `/eval` is invoked on a valid session
- **THEN** the UI SHALL show "正在解析 session..." for Step 0
- **AND** then "Step 1/8: 分解子任务..." through "Step 6/8: 反事实根因裁决..."
- **AND** "Step 7/8: LLM 自主规则归因..."
- **AND** "Step 8/8: LLM 语义规则合并..."

## REMOVED Requirements

### Requirement: Step 7 — Rule Abstraction (deterministic)

**Reason**: Replaced by LLM-based rule attribution. Deterministic CHIFF→Rule mapping, detector registry, and pre-defined catalog are removed. The LLM autonomously generates rules from the full CHIFF context.

**Migration**: The new Step 7 calls `attributeWithLLM(causalGraph, attribution, config, session)` instead of `extractRules(data, steps, stats, meta, graphStore, attribution)`. All detectors in `detectors.ts` and the rule catalog in `taxonomy.ts` are deleted.

### Requirement: Step 8 — Rule Deduplication and Merging (deterministic)

**Reason**: Replaced by LLM-based semantic merge. Exact `rule.id` matching is insufficient when LLM autonomously names rules. The LLM performs semantic matching to determine if two rules describe the same config issue.

**Migration**: The new Step 8 calls `semanticMerge(newRules, existingStore, harness)` instead of `mergeRules(newRules, existingStore)`. The old merge function based on exact ID matching is replaced.

# harness-rule-store Specification

## Purpose

Cross-session persistent rule storage system. Maintains a project-scoped Rule Store (`~/.dscode/eval/rules.json`) that accumulates rule evidence across eval sessions, with deterministic deduplication, severity escalation, and graceful error handling.

## ADDED Requirements

### Requirement: Cross-session rule storage

The system SHALL persist rules to `~/.dscode/eval/rules.json` as a JSON object with the structure:

```json
{
  "version": 1,
  "projectPath": "/path/to/project",
  "rules": {
    "R_PREFER_FILE_OVER_SHELL": { ...HarnessRule },
    ...
  },
  "updatedAt": 1700000000000
}
```

The file SHALL be scoped to the current project. Loading a different project SHALL use a separate Rule Store file.

#### Scenario: Rules persist across sessions

- **WHEN** `/eval` completes for session A and rules are extracted
- **THEN** the rules SHALL be written to `rules.json`
- **AND** when `/eval` runs for session B in the same project, previously stored rules SHALL be loaded
- **AND** evidence from session B SHALL be appended to existing matching rules

#### Scenario: Rules do not cross project boundaries

- **WHEN** the user switches projects
- **THEN** the loaded Rule Store SHALL reflect only the current project's sessions
- **AND** rules from the previous project SHALL NOT appear

### Requirement: Rule deduplication and merging (Step 8)

The system SHALL implement a `mergeRules` function that takes newly extracted rules and existing rules from the store, and produces a merged `HarnessRule[]`. Two rules SHALL be considered matching when they have the same `id` (from the pre-defined catalog).

For matching rules:
- The new `RuleEvidence` SHALL be appended to the existing rule's `evidence` array
- `severity` SHALL be recalculated based on total evidence count
- `suggestion` SHALL be preserved from the existing rule (first occurrence wins)

For non-matching new rules (not in catalog):
- The rule SHALL be added to the store as-is
- Its `id` SHALL be preserved if it follows the `R_` naming convention

#### Scenario: Rule triggered in multiple sessions accumulates evidence

- **WHEN** `R_PREFER_FILE_OVER_SHELL` has 2 existing evidence entries in the store
- **AND** the current session triggers `R_PREFER_FILE_OVER_SHELL`
- **THEN** the merged rule SHALL have 3 evidence entries
- **AND** severity SHALL be recalculated: `evidence_count=3 → severity=0.6` (WARN level)

#### Scenario: New rule not in catalog is added

- **WHEN** extraction produces a rule with `id: "R_CUSTOM_PATTERN"` not present in the store
- **THEN** the rule SHALL be added to the merged output
- **AND** a warning SHALL be logged for non-catalog rules

### Requirement: Severity escalation thresholds

The system SHALL compute rule `severity` as follows:

| evidence_count | severity | label |
|---------------|----------|-------|
| 0             | 0        | (none)|
| 1             | 0.2      | INFO  |
| 2             | 0.4      | INFO  |
| 3             | 0.6      | WARN  |
| 4             | 0.8      | WARN  |
| 5+            | 1.0      | ERROR |

The thresholds SHALL be defined in a constant `SEVERITY_THRESHOLDS` object, not hardcoded in logic.

#### Scenario: Rule escalates to ERROR after 5 sessions

- **WHEN** rule `R_BASH_OVERUSE` has been triggered in 5 distinct sessions
- **THEN** its `severity` SHALL be `1.0`
- **AND** the dashboard SHALL display it as "建议持久化到 Agent 配置"

#### Scenario: Rule stays at INFO after 1 session

- **WHEN** rule `R_BASH_OVERUSE` is triggered for the first time
- **THEN** its `severity` SHALL be `0.2`
- **AND** the dashboard SHALL display it as "观察中"

### Requirement: Rule Store file I/O

The system SHALL provide `loadRuleStore(): RuleStore` and `saveRuleStore(store: RuleStore): void` functions. On load failure (missing file, corrupt JSON), an empty Rule Store SHALL be returned without throwing. On save failure, an error SHALL be logged but SHALL NOT block the eval pipeline.

#### Scenario: Corrupt rules.json is handled gracefully

- **WHEN** `~/.dscode/eval/rules.json` contains invalid JSON
- **THEN** `loadRuleStore()` SHALL return an empty store with `rules: {}`
- **AND** a warning SHALL be logged
- **AND** the next `/eval` SHALL overwrite the corrupt file with a valid store

#### Scenario: Missing rules.json is treated as empty store

- **WHEN** `~/.dscode/eval/rules.json` does not exist
- **THEN** `loadRuleStore()` SHALL return an empty store
- **AND** no error or warning SHALL be emitted

### Requirement: Rule Store is updated at the end of each eval

The `runEval` function in `src/eval/index.ts` SHALL, after generating the dashboard, call `mergeRules` and `saveRuleStore` with the newly extracted rules. The store SHALL be saved regardless of whether the analysis succeeded or fell back to rule engine.

#### Scenario: Eval updates rule store

- **WHEN** `/eval` completes for any session
- **THEN** extracted rules SHALL be merged into the loaded store
- **AND** the updated store SHALL be saved to `rules.json`
- **AND** the dashboard's rules trend section SHALL reflect the updated store

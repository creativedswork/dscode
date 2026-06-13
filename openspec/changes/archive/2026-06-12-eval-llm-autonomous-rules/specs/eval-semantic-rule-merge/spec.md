## ADDED Requirements

### Requirement: LLM-based semantic rule matching

The system SHALL replace deterministic rule merging (by `rule.id` exact match) with an LLM-based semantic matching step. The LLM SHALL receive the newly extracted rules and a summary of existing rules from the Rule Store, and SHALL output merge decisions.

The LLM input SHALL include:
- New rules (complete `HarnessRule` objects, excluding `evidence` arrays and `mergedFrom`)
- Existing rules summary: for each rule in the store, its `id`, `category`, `abstract` (first 200 chars), and total `evidence_count`
- The instruction: for each new rule, determine if it describes the same underlying Agent configuration problem as any existing rule

The LLM output SHALL be a JSON array of merge decisions, where each decision contains:
- `newRuleId: string` — the ID of the new rule being evaluated
- `decision: "merge" | "new"` — whether to merge into an existing rule or add as new
- `targetRuleId?: string` — if "merge", the existing rule's ID
- `reasoning: string` — brief explanation of the matching decision

#### Scenario: New rule semantically matches existing rule

- **WHEN** a new rule has `abstract: "Agent overwrites files without prior read validation"` and the store has a rule with `abstract: "write_file operations should be preceded by read_file to verify current state"`
- **THEN** the LLM SHALL output `decision: "merge"` with `targetRuleId` set to the existing rule's ID
- **AND** `reasoning` SHALL explain the semantic equivalence

#### Scenario: New rule describes a genuinely new problem

- **WHEN** a new rule describes a config issue not present in any existing rule
- **THEN** the LLM SHALL output `decision: "new"`
- **AND** no `targetRuleId` SHALL be present

#### Scenario: Empty existing store

- **WHEN** the Rule Store is empty (no existing rules)
- **THEN** Step 8 SHALL skip the LLM call entirely
- **AND** all new rules SHALL be added as new entries

#### Scenario: No new rules to merge

- **WHEN** Step 7 produced an empty `HarnessRule[]`
- **THEN** Step 8 SHALL skip the LLM call
- **AND** the existing store SHALL be preserved unchanged

### Requirement: Merge execution based on LLM decisions

The system SHALL apply the LLM's merge decisions to update the Rule Store:

- For "merge" decisions: append the new rule's `evidence` to the existing rule's `evidence` array, append the new rule's `id` to the existing rule's `mergedFrom` array (or create it), recalculate `severity` based on total evidence count, and preserve the existing rule's `id`, `abstract`, and `suggestion` (earliest occurrence wins)
- For "new" decisions: add the new rule to the store as-is, with `severity` calculated from its evidence count

#### Scenario: Merge appends evidence and updates severity

- **WHEN** a new rule "R_OVERWRITE_WITHOUT_READ" with 1 evidence entry is merged into existing rule "R_PREFER_READ_BEFORE_WRITE" with 2 evidence entries
- **THEN** the merged rule SHALL have 3 evidence entries
- **AND** severity SHALL be recalculated: `evidence_count=3 → severity=0.6`
- **AND** `mergedFrom` SHALL include "R_OVERWRITE_WITHOUT_READ"
- **AND** the rule's `id` and `abstract` SHALL remain "R_PREFER_READ_BEFORE_WRITE"

#### Scenario: New rule added without merging

- **WHEN** a new rule "R_SKILL_CONFLICT_AGENTS_MD" is not semantically matched to any existing rule
- **THEN** the rule SHALL be added to the store with its original `id`, `abstract`, and `suggestion`
- **AND** severity SHALL be computed from its evidence count

### Requirement: Merge LLM failure handling

If the Step 8 LLM call fails (network error, timeout, invalid JSON after retry), the system SHALL fall back to adding all new rules as new entries (no merging attempted). This ensures that evidence is never lost due to merge failure.

#### Scenario: Merge LLM call fails

- **WHEN** the Step 8 LLM call fails after both initial call and one retry
- **THEN** all new rules SHALL be added to the store as new entries
- **AND** a warning SHALL be logged: "Semantic merge unavailable: all new rules added without merging"
- **AND** the eval pipeline SHALL continue normally

#### Scenario: Merge LLM returns partial results

- **WHEN** the LLM returns merge decisions for only some new rules but not all
- **THEN** rules with decisions SHALL be merged according to those decisions
- **AND** rules without decisions SHALL be added as new entries
- **AND** a warning SHALL be logged about incomplete merge coverage

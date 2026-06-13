## ADDED Requirements

### Requirement: LLM autonomously generates rules from full CHIFF context

The system SHALL replace all deterministic rule extraction (detector registry, pre-defined catalog, CHIFF→Rule mapping) with a single LLM call. The LLM SHALL receive the complete CHIFF analysis context and autonomously identify Agent configuration issues.

The LLM input SHALL include:
- CHIFF subtask summary (names, step ranges, oracle goals)
- Causal graph key paths (subtask→subtask edges with failure modes, agent→agent edges with errors)
- Step data flows with correctness anomalies (where `correctness !== "correct"`)
- Candidate error set (top 5 by impact_score, with irrecoverable reasons)
- Attribution conclusion (mistake_agent, mistake_step, reason, rules_applied)
- Session key fragments: the 5 steps surrounding the mistake_step (thought, action, result)
- Current Agent configuration excerpts: Identity, Soul, Tool Use Rules, AGENTS.md key lines
- The total session length and tool call statistics

The LLM SHALL output a JSON `HarnessRule[]` array where each rule contains:
- `id: string` — a concise, stable rule identifier (LLM-generated, e.g., `"R_WRITE_WITHOUT_READ_VALIDATION"`)
- `category: RuleCategory` — which Agent config layer is implicated (identity, tool_use, tool_registry, agents_md, skill, or "other")
- `targetLayer: string` — finer-grained target within the layer
- `abstract: string` — de-concretized description decoupled from this specific session
- `rawDescription: string` — LLM's complete original observation including session-specific context
- `severity: number` — 0.0 to 1.0, LLM's initial assessment of how serious this config issue is
- `suggestion: RuleSuggestion` — actionable config modification with `action`, `proposed` text, and `rationale`

#### Scenario: LLM generates rules after successful CHIFF pipeline

- **WHEN** CHIFF Steps 1-6 complete successfully with full causal graph and attribution
- **THEN** Step 7 SHALL call the LLM with the complete CHIFF context
- **AND** the LLM SHALL return a `HarnessRule[]` array
- **AND** each rule SHALL have a non-empty `id`, `abstract`, `rawDescription`, and `suggestion`
- **AND** `category` SHALL be one of the valid `RuleCategory` values

#### Scenario: LLM generates rules on rule-engine fallback

- **WHEN** CHIFF pipeline falls back to rule-engine mode (no causal graph, no attribution)
- **THEN** Step 7 SHALL still call the LLM with session statistics and key fragments only
- **AND** the LLM SHALL return rules based on observable patterns in the session data
- **AND** `EvalResult.analysisMode` SHALL remain `"rule"`

#### Scenario: LLM identifies a novel config issue not in any pre-defined catalog

- **WHEN** the session exhibits a pattern not anticipated by any existing rule template (e.g., "Soul section's 'editorial voice' conflicts with AGENTS.md's 'concise and direct' instruction, causing inconsistent output style")
- **THEN** the LLM SHALL generate a new rule with a novel `id` and `abstract`
- **AND** `category` MAY be "other" if the issue spans multiple config layers
- **AND** `suggestion.proposed` SHALL target the specific config sections implicated

#### Scenario: LLM finds no config-level issues worth reporting

- **WHEN** the session executed well and the LLM determines no Agent config changes are warranted
- **THEN** the LLM MAY return an empty `HarnessRule[]`
- **AND** `EvalResult.rules` SHALL be an empty array
- **AND** the dashboard SHALL display "未检测到 Agent 配置问题"

### Requirement: Simplified HarnessRule type without deterministic pattern

The system SHALL define a `HarnessRule` interface without `pattern: RulePattern` and without `needsLlm?: boolean`. The `RulePattern` type SHALL be removed from the codebase.

The simplified `HarnessRule` SHALL contain:
- `id: string` — LLM-generated stable identifier
- `category: RuleCategory | "other"` — config layer, extended to allow "other"
- `targetLayer: string` — fine-grained target path
- `abstract: string` — de-concretized description
- `rawDescription: string` — LLM's full original observation
- `severity: number` — 0.0 to 1.0 (initial LLM assessment, adjusted by evidence count)
- `evidence: RuleEvidence[]` — accumulated across sessions
- `suggestion: RuleSuggestion` — actionable config modification
- `mergedFrom?: string[]` — IDs of rules merged into this one (for cross-session tracking)

#### Scenario: HarnessRule serialization round-trip

- **WHEN** a `HarnessRule` with all fields populated is serialized to JSON
- **THEN** deserialization SHALL reconstruct an equivalent `HarnessRule`
- **AND** `mergedFrom` SHALL be empty or absent if the rule has never been merged

#### Scenario: Old-format rule store compatibility

- **WHEN** `rules.json` contains rules with `pattern` and `needsLlm` fields from the previous format
- **THEN** `loadRuleStore()` SHALL strip `pattern` and `needsLlm` during deserialization
- **AND** the loaded rules SHALL be usable by the new LLM-based pipeline
- **AND** on next save, the stripped format SHALL be written

### Requirement: LLM output validation and retry

The LLM output from Step 7 SHALL be validated against a Zod schema for `HarnessRule[]`. If validation fails (invalid JSON, missing required fields, invalid category), the system SHALL retry once with a format correction hint. After two consecutive failures, the system SHALL log a warning, return an empty array, and NOT block the eval pipeline.

#### Scenario: Valid LLM output passes validation

- **WHEN** the LLM returns a valid JSON array of HarnessRule objects
- **THEN** the rules SHALL be accepted and included in `EvalResult.rules`

#### Scenario: Invalid LLM output triggers retry

- **WHEN** the LLM returns JSON missing the required `abstract` field
- **THEN** the system SHALL retry once with the error message: "Missing required field 'abstract' in rule[0]"
- **AND** if retry succeeds, the corrected rules SHALL be used

#### Scenario: Two consecutive failures produce empty rules

- **WHEN** both the initial call and retry produce invalid output
- **THEN** the system SHALL log a warning
- **AND** `EvalResult.rules` SHALL be an empty array
- **AND** the eval pipeline SHALL continue normally (dashboard generation etc.)

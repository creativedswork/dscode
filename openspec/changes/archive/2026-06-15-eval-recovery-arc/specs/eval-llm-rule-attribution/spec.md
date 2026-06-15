# eval-llm-rule-attribution Delta Specification

## MODIFIED Requirements

### Requirement: LLM autonomously generates rules from full CHIFF context

The system SHALL replace all deterministic rule extraction (detector registry, pre-defined catalog, CHIFF→Rule mapping) with a single LLM call. The LLM SHALL receive the complete CHIFF analysis context and autonomously identify Agent configuration issues.

The LLM input SHALL include:
- CHIFF subtask summary (names, step ranges, oracle goals)
- Causal graph key paths (subtask→subtask edges with failure modes, agent→agent edges with errors)
- Step data flows with correctness anomalies (where `correctness !== "correct"`)
- Candidate error set (top 5 by impact_score, with irrecoverable reasons)
- Attribution conclusion (mistake_agent, mistake_step, reason, rules_applied)
- **Recovery arcs summary** (when available): error agent/step, detection type, correction agent/step, steps to recover, misdiagnosis count, rootCauseHypothesis per arc
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

#### Scenario: LLM generates rules from recovery patterns

- **WHEN** recovery arcs show `misdiagnosisCount >= 2` with `detectionType === "test_failure"`
- **THEN** the LLM MAY generate a rule targeting the "diagnose before fix" workflow in the Tool Use Rules layer
- **AND** the rule abstract SHALL reference the recovery pattern as evidence
- **AND** the suggestion SHALL be de-concretized (not referencing specific step numbers)

#### Scenario: Step 7 without recovery arcs (backward compat)

- **WHEN** Step 7 LLM is called but no recovery arcs are available (pipeline fallback, or Step 6 didn't produce any)
- **THEN** the prompt SHALL omit the recovery arcs section
- **AND** Harness Rule generation SHALL proceed normally with the existing context

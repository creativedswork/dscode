## MODIFIED Requirements

### Requirement: LLM autonomously generates rules from full CHIFF context

The system SHALL generate harness rules via a single LLM call that receives the complete CHIFF analysis context. There is no non-attribution fallback path — `attributeWithLLM` is always called after successful CHIFF pipeline completion.

The LLM input SHALL include:
- CHIFF subtask summary (names, step ranges, oracle goals, phaseStatus)
- Causal graph key paths (subtask→subtask edges with failure modes, agent→agent edges with errors)
- Step data flows with correctness anomalies (where `correctness !== "correct"`)
- Candidate error set (top 5 by impact_score, with deviationDescriptions and irrecoverable reasons)
- Attribution conclusion (mistake_agent, mistake_step, reason, rules_applied, rootCauseTitle, rootCauseSeverity)
- Session key fragments: the 5 steps surrounding the mistake_step (thought, action, result)
- Current Agent configuration excerpts: Identity, Soul, Tool Use Rules, AGENTS.md key lines
- The total session length and tool call statistics
- Recovery arcs (if any were detected in Step 6)

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

## REMOVED Requirements

### Requirement: LLM generates rules on rule-engine fallback

**Reason**: The rule-engine fallback mode no longer exists. `attributeWithLLM` is never called without CHIFF graph context. The scenario of calling with "session statistics and key fragments only" and keeping `analysisMode: "rule"` is obsolete.

**Migration**: Remove the `graphStore = null` and `attribution = null` parameter paths from `attributeWithLLM`. The function signature changes to require non-null graph context and attribution.

## MODIFIED Requirements

### Requirement: Dashboard HTML Generation

The system SHALL generate a self-contained HTML file at `~/.dscode/eval/{session_id_prefix}.html` with dark theme, inline CSS, and no external dependencies. The dashboard SHALL contain: header with metadata and analysis mode badge ("🤖 CHIFF Causal Graph Analysis" or "⚙ 规则引擎分析（LLM Unavailable）"), summary stat cards (message count, tool calls, error rate, screenshots, complaints, deviations, **triggered rules count**) with color coding (ok=#3fb950, warn=#d2991d, danger=#f85149), phase timeline with horizontal colored bars, **causal graph visualization section** (LLM mode only — bar chart showing subtask→subtask dependencies with color-coded nodes), **data flow paths section** (LLM mode only — table showing key data items and their complete production→consumption chains), **Rule reasoning chain section** (LLM mode only — Rule1/2/3/4 application with evidence), **Harness Rules section** (all modes — grouped by `category` with severity badges and expandable suggestions), **Rule Trends section** (all modes — bar chart of cross-session rule evidence accumulation, loadable independently from Rule Store), root cause analysis section, deviations section, and event timeline.

#### Scenario: Dashboard with harness rules

- **WHEN** a session analysis completes with triggered HarnessRules (LLM-generated)
- **THEN** the generated HTML SHALL include a Harness Rules section
- **AND** rules SHALL be grouped by `category` field (LLM-assigned)
- **AND** each rule SHALL display `id`, `abstract`, severity badge, and expandable `suggestion` with `proposed` text and `rationale`
- **AND** SHALL include a Rule Trends section loading data from the Rule Store
- **AND** summary stat cards SHALL include a "Triggered Rules" count

#### Scenario: Dashboard in rule-engine fallback mode

- **WHEN** the causal graph could not be built and rule engine was used
- **THEN** the dashboard SHALL omit the causal graph, data flow paths, and Rule reasoning chain sections
- **AND** SHALL still render the Harness Rules and Rule Trends sections
- **AND** SHALL display the rule-engine analysis flag

### Requirement: Harness Rules Section

The dashboard SHALL include a "Harness Rules" section that displays the `HarnessRule[]` from `EvalResult.rules`. Rules SHALL be grouped by `category` with category headers (using `CATEGORY_LABELS` for display names; rules with `category: "other"` grouped under "Other"). Each rule card SHALL display:

- Rule `id` and `abstract` as the primary content
- `rawDescription` as secondary detail (collapsed by default, expandable)
- `severity` as a colored badge (INFO=#58a6ff, WARN=#d2991d, ERROR=#f85149)
- Total evidence count and date of last trigger
- Expandable `suggestion` with `proposed` text and `rationale`
- For `severity >= ERROR`: a callout "建议持久化到 Agent 配置" with the `targetLayer`
- If `mergedFrom` is present and non-empty: a small note "从 N 个相关规则合并" with collapsible list of merged rule IDs

#### Scenario: Rules section with mixed severities

- **WHEN** the evaluation produces rules with severities 0.2 (INFO), 0.6 (WARN), and 1.0 (ERROR)
- **THEN** each rule SHALL be displayed with its corresponding color badge
- **AND** ERROR-level rules SHALL show the "建议持久化到 Agent 配置" callout
- **AND** INFO-level rules SHALL NOT show the callout

#### Scenario: No rules triggered

- **WHEN** the evaluation produces an empty `rules` array
- **THEN** the Harness Rules section SHALL display "未检测到 Agent 配置问题" (in muted text)
- **AND** the section SHALL still be rendered (not hidden)

#### Scenario: Rule was merged from previous sessions

- **WHEN** a rule has `mergedFrom: ["R_OVERWRITE_NO_READ", "R_WRITE_VALIDATION_MISSING"]`
- **THEN** the rule card SHALL display "从 2 个相关规则合并"
- **AND** the merged rule IDs SHALL be visible on expand

### Requirement: Rule Trends Visualization

The dashboard SHALL include a "Rule Trends" section that loads the full Rule Store (`~/.dscode/eval/rules.json`) and visualizes trends across all sessions. The section SHALL contain:

- A horizontal bar chart showing each rule's total evidence count (ordered by count descending)
- Rule categories as color-coded bar segments
- A "总规则数" and "ERROR 级规则数" summary
- Rules with evidence count ≥ 3 (WARN+) SHALL be highlighted
- For rules with `mergedFrom`, display a merge chain indicator

The trends section SHALL load data from the Rule Store independently of the current session's `EvalResult`, ensuring it always shows the complete accumulated state.

#### Scenario: Trends show multi-session rule accumulation

- **WHEN** the Rule Store has rule A with 4 evidence entries and rule B with 1 entry
- **THEN** rule A SHALL appear as the first bar with count=4 and WARN highlight
- **AND** rule B SHALL appear with count=1 and no highlight
- **AND** the summary SHALL show "总规则数: 2" and "ERROR 级: 0"

#### Scenario: Trends load from empty store

- **WHEN** `rules.json` does not exist or is empty
- **THEN** the trends section SHALL display "暂无跨 session 规则数据"
- **AND** no error SHALL be displayed

#### Scenario: Trends accommodate old-format rules

- **WHEN** the Rule Store contains rules from the old deterministic format (with `pattern` and `needsLlm` fields)
- **THEN** the dashboard SHALL display them correctly by ignoring the deprecated fields
- **AND** `pattern.type` SHALL NOT be used for categorization (use `category` instead)

## REMOVED Requirements

### Requirement: Pre-defined catalog categorization display

**Reason**: The pre-defined rule catalog (`taxonomy.ts`) is removed. Rules are now LLM-generated with LLM-assigned categories. The dashboard no longer needs to reference `RULE_CATALOG` or `CATEGORY_LAYER_MAP` for display logic.

**Migration**: Dashboard groups rules by `rule.category` field (which the LLM assigns) using the existing `CATEGORY_LABELS` map. The `RULE_CATALOG` import is removed from dashboard code.

### Requirement: Pattern-type specific display

**Reason**: The `RulePattern.type` field (statistical, behavioral, structural) is removed along with the detector system.

**Migration**: Dashboard no longer displays pattern type indicators. The `rawDescription` field provides richer context than a simple type label.

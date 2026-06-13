## ADDED Requirements

### Requirement: Harness Rules Section

The dashboard SHALL include a "Harness Rules" section that displays the `HarnessRule[]` from `EvalResult.rules`. Rules SHALL be grouped by `RuleCategory` with category headers. Each rule card SHALL display:

- Rule `id` and `abstract` as the primary content
- `severity` as a colored badge (INFO=#58a6ff, WARN=#d2991d, ERROR=#f85149)
- Total evidence count and date of last trigger
- Expandable `suggestion` with `proposed` text and `rationale`
- For `severity >= ERROR`: a callout "建议持久化到 Agent 配置" with the `targetLayer`

#### Scenario: Rules section with mixed severities

- **WHEN** the evaluation produces rules with severities 0.2 (INFO), 0.6 (WARN), and 1.0 (ERROR)
- **THEN** each rule SHALL be displayed with its corresponding color badge
- **AND** ERROR-level rules SHALL show the "建议持久化到 Agent 配置" callout
- **AND** INFO-level rules SHALL NOT show the callout

#### Scenario: No rules triggered

- **WHEN** the evaluation produces an empty `rules` array
- **THEN** the Harness Rules section SHALL display "未检测到 Agent 配置问题" (in the muted text color)
- **AND** the section SHALL still be rendered (not hidden)

### Requirement: Rule Trends Visualization

The dashboard SHALL include a "Rule Trends" section that loads the full Rule Store (`~/.dscode/eval/rules.json`) and visualizes trends across all sessions. The section SHALL contain:

- A horizontal bar chart showing each rule's total evidence count (ordered by count descending)
- Rule categories as color-coded bar segments
- A "总规则数" and "ERROR 级规则数" summary
- Rules with evidence count ≥ 3 (WARN+) SHALL be highlighted

The trends section SHALL load data from the Rule Store independently of the current session's `EvalResult`, ensuring it always shows the complete accumulated state.

#### Scenario: Trends show multi-session rule accumulation

- **WHEN** the Rule Store has `R_BASH_OVERUSE` with 4 evidence entries and `R_FIX_CASCADE` with 1 entry
- **THEN** `R_BASH_OVERUSE` SHALL appear as the first bar with count=4 and WARN highlight
- **AND** `R_FIX_CASCADE` SHALL appear with count=1 and no highlight
- **AND** the summary SHALL show "总规则数: 2" and "ERROR 级: 0"

#### Scenario: Trends load from empty store

- **WHEN** `rules.json` does not exist or is empty
- **THEN** the trends section SHALL display "暂无跨 session 规则数据"
- **AND** no error SHALL be displayed

## MODIFIED Requirements

### Requirement: Dashboard HTML Generation

The system SHALL generate a self-contained HTML file at `~/.dscode/eval/{session_id_prefix}.html` with dark theme, inline CSS, and no external dependencies. The dashboard SHALL contain: header with metadata and analysis mode badge ("🤖 CHIFF Causal Graph Analysis" or "⚙ 规则引擎分析（LLM Unavailable）"), summary stat cards (message count, tool calls, error rate, screenshots, complaints, deviations, **triggered rules count**) with color coding (ok=#3fb950, warn=#d2991d, danger=#f85149), phase timeline with horizontal colored bars, **causal graph visualization section** (LLM mode only — bar chart showing subtask→subtask dependencies with color-coded nodes), **data flow paths section** (LLM mode only — table showing key data items and their complete production→consumption chains), **Rule reasoning chain section** (LLM mode only — Rule1/2/3/4 application with evidence), **Harness Rules section** (all modes — grouped by category, with severity badges and expandable suggestions), **Rule Trends section** (all modes — bar chart of cross-session rule evidence accumulation), root cause analysis section, deviations section, and event timeline.

#### Scenario: Dashboard with harness rules

- **WHEN** a session analysis completes with triggered HarnessRules
- **THEN** the generated HTML SHALL include a Harness Rules section
- **AND** SHALL include a Rule Trends section loading data from the Rule Store
- **AND** summary stat cards SHALL include a "Triggered Rules" count

#### Scenario: Dashboard in rule-engine fallback mode

- **WHEN** the causal graph could not be built and rule engine was used
- **THEN** the dashboard SHALL omit the causal graph, data flow paths, and Rule reasoning chain sections
- **AND** SHALL still render the Harness Rules and Rule Trends sections
- **AND** SHALL display the rule-engine analysis flag

### Requirement: dscode-Specific Improvement Suggestions

~~The analysis engine SHALL generate suggestions focused on improving the dscode agent itself, not generic user advice. Each suggestion SHALL reference specific session evidence and propose a concrete agent design change.~~

~~Rule-engine suggestions SHALL target specific anti-patterns with concrete system prompt / workflow changes. LLM suggestions SHALL be free-form in Chinese, 2-3 sentences each, citing message indices and focusing on agent design improvements (system prompt, workflow, tool-use strategy, error recovery, self-awareness).~~

[REPLACED BY: Harness Rules section — see ADDED Requirements above. The `suggestions: string[]` field is removed from `EvalResult` and replaced with `rules: HarnessRule[]`. The dashboard renders rules in the Harness Rules and Rule Trends sections instead.]

#### Scenario: DEPRECATED — Suggestions for a session with perception blind spot

~~- **WHEN** a session has deviations and a "截图感知盲区" root cause~~
~~- **THEN** the rule engine SHALL suggest adding a screenshot-vs-goal verification step to agent workflow~~
~~- **AND** the suggestion SHALL cite specific message indices as evidence~~

[REPLACED: Perception blind spot patterns now trigger `R_PERCEPTION_BLINDNESS` rule in the Harness Rules section, with the suggestion targeting the Tool Use layer.]

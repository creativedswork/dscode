# eval-iterative-focusing Specification

## Purpose

三 Pass 迭代聚焦管线，用于大 session（≥500 steps）的 CHIFF 因果图归因。替代原 7-step 全量管线：Pass 1 粗扫识别 3-5 个可疑区，Pass 2 逐区深潜构建因果子图（支持递归拆分和并行），Pass 3 跨区综合确定根因和级联路径。

## ADDED Requirements

### Requirement: Path selection based on session size

The system SHALL select the analysis path based on the number of parsed HistorySteps.

- If `steps.length < 500`: use existing `runCausalGraphPipeline()` (fast path)
- If `steps.length >= 500`: use `runFocusPipeline()` (iterative focusing path)

The threshold SHALL be hardcoded as a named constant `FOCUS_PATH_THRESHOLD = 500` in `src/eval/focus/index.ts`. No configuration file, environment variable, or CLI flag SHALL be required or read for this threshold in V1.

#### Scenario: Small session uses fast path

- **WHEN** a session parses to 300 HistorySteps
- **THEN** `runEval` SHALL call `runCausalGraphPipeline()`
- **AND** the full 7-step CHIFF pipeline SHALL execute unchanged

#### Scenario: Large session uses focus path

- **WHEN** a session parses to 800 HistorySteps
- **THEN** `runEval` SHALL call `runFocusPipeline()`
- **AND** the three-pass iterative pipeline SHALL execute

### Requirement: Pass 1 Scan — attention zone identification

The system SHALL call an LLM once to identify 3-5 attention zones from the SessionSkeleton.

The Scan LLM prompt SHALL include:
- Session metadata and statistics
- Phase map with status indicators
- Signal anchors with priorities
- Hot Zone summaries (step ranges and key signals, not per-step detail)
- Cold Zone statistical summaries
- Data item tracker (items with ≥5 operations)

The LLM SHALL output a `ScanResult` containing:
- `zones: AttentionZone[]` — 3 to 5 zones, each with stepStart/stepEnd (global step IDs), suspicionScore (0.0-1.0), primarySignal type, summary, keyAgents, keyDataItems
- `globalAssessment: string` — one-sentence overall assessment
- `noIssuesDetected: boolean` — true if session appears to have no significant issues

Zones SHALL be ordered by `suspicionScore` descending. Each zone's step range SHALL be non-overlapping with other zones where possible.

Signal types for `primarySignal` SHALL be: "user_complaint_cluster", "error_burst", "repair_loop", "screenshot_divergence", "irreversible_action", "taste_drift".

#### Scenario: Scan identifies complaint cluster as top zone

- **WHEN** Phase P3 has status "danger" with 3 user complaints and 2 tool errors in steps 300-360
- **THEN** the top AttentionZone SHALL have stepStart ≤300 and stepEnd ≥360
- **AND** `primarySignal` SHALL be "user_complaint_cluster" or "repair_loop"
- **AND** `suspicionScore` SHALL be ≥0.7

#### Scenario: Scan finds no issues

- **WHEN** all phases have status "ok" and no signal anchors exist
- **THEN** `noIssuesDetected` SHALL be true
- **AND** the system SHALL skip Pass 2 and Pass 3
- **AND** return ruleResult with `analysisMode: "rule"`

#### Scenario: Scan produces exactly 3 zones when only 3 significant signals exist

- **WHEN** the skeleton has only 3 distinct signal clusters
- **THEN** the LLM SHALL return exactly 3 AttentionZones
- **AND** not fabricate additional zones

### Requirement: Pass 2 Zoom — per-zone causal sub-graph construction

The system SHALL, for each AttentionZone where stepEnd - stepStart ≤ 200, call an LLM once to construct a complete causal sub-graph within that zone.

The Zoom LLM prompt SHALL include:
- Zone metadata (id, step range, suspicionScore, primarySignal, summary)
- Detailed HistorySteps within [zone.stepStart - 10, zone.stepEnd + 10] (context window)
- Instruction to produce: zone subtasks (2-4), subtask edges, agent nodes with OTAR, step data flows, agent edges, and ≥3 candidate errors within the zone

The LLM SHALL output a `ZoneAnalysis` containing:
- `zoneId`: matching the AttentionZone id
- `subtasks: ZoneSubtask[]` — 2-4 zone-level subtasks
- `subtaskEdges: SubtaskEdge[]` — edges between zone subtasks
- `agentNodes: AgentNode[]` — OTAR agent nodes within the zone
- `agentEdges: AgentEdge[]` — dependency edges between agents
- `stepDataFlows: StepDataFlow[]` — data flow tracking within the zone
- `candidates: ZoneCandidate[]` — ≥3 candidate error steps
- `topCandidate`: the highest-impact candidate within the zone
- `zoneGraphComplete: boolean`

All types (SubtaskEdge, AgentNode, AgentEdge, StepDataFlow) SHALL reuse existing CHIFF schemas unchanged.

#### Scenario: Zone zoom produces complete sub-graph

- **WHEN** Zone Z1 covers steps 300-360 (61 steps)
- **THEN** the Zoom LLM SHALL produce a ZoneAnalysis with 2-4 subtasks covering steps 300-360
- **AND** `zoneGraphComplete` SHALL be true
- **AND** `candidates` SHALL have ≥3 entries ranked by impactScore

#### Scenario: Zone zoom with error context window

- **WHEN** Zone Z1 starts at step 300, ends at step 360
- **THEN** the prompt SHALL include steps 290-370 (context window of ±10)
- **AND** `subtasks[0].stepStart` SHALL be ≥300 and `subtasks[last].stepEnd` SHALL be ≤360

### Requirement: Pass 2 Recursive splitting for oversized zones

The system SHALL recursively split any AttentionZone where stepEnd - stepStart > 200.

For an oversized zone:
1. Build a mini-Skeleton from the zone's steps using the same rule engine analysis
2. Call Scan LLM within the zone to identify sub-zones
3. Recursively Zoom each sub-zone (depth ≤ 3)
4. Merge sub-zone analyses into a single ZoneAnalysis

Recursive depth SHALL be capped at 3. If a zone is still >200 steps at depth 3, it SHALL be truncated to the first 200 steps with a warning.

#### Scenario: Single-level recursion on large zone

- **WHEN** Zone Z2 covers steps 400-700 (301 steps, >200)
- **THEN** the system SHALL recursively split Z2
- **AND** produce 2-3 sub-zones
- **AND** each sub-zone SHALL be ≤200 steps

#### Scenario: Recursive depth cap

- **WHEN** a zone requires more than 3 levels of recursive splitting
- **THEN** the system SHALL truncate at depth 3 to the first 200 steps
- **AND** log a warning: "Zone recursive depth exceeded, truncating"

### Requirement: Pass 3 Synthesize — cross-zone root cause attribution

The system SHALL call an LLM once to synthesize all ZoneAnalyses and determine the single root cause.

The Synthesize LLM prompt SHALL include:
- ScanResult (all attention zones with suspicion scores and summaries)
- All ZoneAnalysis results (top candidate from each zone, key data flows)
- Global skeleton (for cross-zone context)
- The three counterfactual rules (Rule 1: Control Flow, Rule 2: Data Flow, Rule 3: Irrecoverable Point)
- CHIFF Rule 4 (Taste / Creative Drift) for dscode-specific quality issues

The LLM SHALL output a `FocusAttribution` containing:
- `mistakeAgent: string` — tool name of the root cause agent
- `mistakeStep: number` — global step number
- `zoneId: string` — which zone contains the root cause
- `reason: string` — detailed explanation applying the counterfactual rules
- `rulesApplied: string[]` — which rules were determinative
- `cascadePath: CascadeEdge[]` — how the error propagated across zones
- `alternateRootCauses: { stepId, agent, reason, confidence }[]` — 0-2 alternative explanations

Each `CascadeEdge` SHALL contain: fromZoneId, fromStepId, toZoneId, toStepId, dataItem, and mechanism (one of: "data_contamination", "irreversible_lock_in", "perception_blind_spot", "repair_cascade", "taste_drift_propagation").

#### Scenario: Root cause identified with cascade path

- **WHEN** Zone A step 314's incorrect file write caused Zone B step 480's repair loop and Zone C step 550's secondary fixes
- **THEN** `mistakeStep` SHALL be 314
- **AND** `zoneId` SHALL be the Zone A id
- **AND** `cascadePath` SHALL contain edges: ZA/314→ZB/480 and ZB/480→ZC/550
- **AND** `mechanism` for the first edge SHALL be "data_contamination"

#### Scenario: Ambiguous root cause provides alternatives

- **WHEN** the LLM identifies two plausible root causes with similar confidence
- **THEN** the primary `mistakeStep` SHALL be the higher-confidence one
- **AND** `alternateRootCauses` SHALL contain the other with its confidence score

### Requirement: Pass 3 Rule extraction from focused context

The system SHALL extract HarnessRules using the focused context (ScanResult + ZoneAnalyses + FocusAttribution) rather than the full session.

The rule extraction SHALL reuse the existing `attributeWithLLM` function but with input derived from the focused pipeline:
- Graph snapshot from merged zone analyses
- Attribution from Pass 3
- Session fragments around the root cause step
- Config excerpts from project AGENTS.md and STYLE.md
- Statistics summary

The output format and validation SHALL be identical to existing HarnessRule[] output.

#### Scenario: Rules extracted after focus pipeline

- **WHEN** Pass 3 completes with a FocusAttribution
- **THEN** rule extraction SHALL produce HarnessRule[]
- **AND** rules SHALL reference the focused context (zone-level data flows, not full session)
- **AND** `EvalResult.rules` SHALL be populated

### Requirement: FocusReport to EvalResult compatibility

The system SHALL convert a `FocusReport` into the existing `EvalResult` format for dashboard generation compatibility.

The conversion SHALL map:
- `FocusReport.attribution` → `EvalResult.attribution` (using `mistakeAgent`, `mistakeStep`, `reason`, `rulesApplied`)
- Zone subtasks merged → `EvalResult.causalGraph` (as a CausalGraphSnapshot)
- Zone candidates merged into `EvalResult.deviations`
- `FocusReport.scan.zones` mapped to phases if applicable
- `EvalResult.analysisMode` set to `"llm"`
- `EvalResult.rules` set from rule extraction

#### Scenario: FocusReport converts to valid EvalResult

- **WHEN** a FocusReport with 3 zone analyses and attribution is produced
- **THEN** the converted EvalResult SHALL have `analysisMode: "llm"`
- **AND** `attribution` SHALL be non-null
- **AND** `causalGraph` SHALL be non-null
- **AND** dashboard generation SHALL succeed without code changes
- **AND** cascadePath visualization SHALL be rendered when FocusAttribution contains non-empty cascadePath

### Requirement: Cascade path visualization in dashboard

The dashboard SHALL visualize the cascadePath from FocusAttribution when the analysis mode is "llm" and cascadePath is non-empty.

The visualization SHALL show:
- Each zone as a labeled block with zoneId, step range, and suspicionScore
- Cascade edges as arrows between zones, labeled with the dataItem and mechanism
- The root cause zone highlighted distinctly (red border and "根因" badge)
- Timestamp ordering preserved (zones displayed left-to-right in chronological order)

Cascade mechanism labels SHALL use Chinese display names:
- "data_contamination" → "数据污染"
- "irreversible_lock_in" → "不可逆锁定"
- "perception_blind_spot" → "感知盲区"
- "repair_cascade" → "修复连锁"
- "taste_drift_propagation" → "品味漂移传播"

The cascade path section SHALL appear in the dashboard between the attribution section and the rules section. When cascadePath is empty or analysisMode is "rule", this section SHALL NOT be rendered.

#### Scenario: Cascade path rendered for multi-zone session

- **WHEN** FocusAttribution has cascadePath with edges Z1/314→Z2/480 (data_contamination) and Z2/480→Z3/550 (repair_cascade)
- **THEN** the dashboard SHALL render zone blocks for Z1, Z2, Z3 in chronological order
- **AND** arrows SHALL connect Z1→Z2 labeled "数据污染: water.frag" and Z2→Z3 labeled "修复连锁"
- **AND** Z1 block SHALL have a red border and "根因" badge

#### Scenario: No cascade path when error is single-zone

- **WHEN** FocusAttribution has an empty cascadePath (root cause did not propagate across zones)
- **THEN** the cascade path section SHALL NOT be rendered
- **AND** the existing attribution display SHALL be shown instead

#### Scenario: Cascade path hidden in rule-engine fallback mode

- **WHEN** EvalResult.analysisMode is "rule" (no FocusAttribution available)
- **THEN** the cascade path section SHALL NOT be rendered

### Requirement: Cascade path visualization in dashboard

The dashboard SHALL visualize the cascadePath from FocusAttribution when the analysis mode is "llm" and cascadePath is non-empty.

The visualization SHALL show:
- Each zone as a labeled block with zoneId, step range, and suspicionScore
- Cascade edges as arrows between zones, labeled with the dataItem and mechanism
- The root cause zone highlighted distinctly (red border and "根因" badge)
- Timestamp ordering preserved (zones displayed left-to-right in chronological order)

Cascade mechanism labels SHALL use Chinese display names:
- "data_contamination" → "数据污染"
- "irreversible_lock_in" → "不可逆锁定"
- "perception_blind_spot" → "感知盲区"
- "repair_cascade" → "修复连锁"
- "taste_drift_propagation" → "品味漂移传播"

The cascade path section SHALL appear in the dashboard between the attribution section and the rules section. When cascadePath is empty or analysisMode is "rule", this section SHALL NOT be rendered.

#### Scenario: Cascade path rendered for multi-zone session

- **WHEN** FocusAttribution has cascadePath with edges Z1/314→Z2/480 (data_contamination) and Z2/480→Z3/550 (repair_cascade)
- **THEN** the dashboard SHALL render zone blocks for Z1, Z2, Z3 in chronological order
- **AND** arrows SHALL connect Z1→Z2 labeled "数据污染: water.frag" and Z2→Z3 labeled "修复连锁"
- **AND** Z1 block SHALL have a red border and "根因" badge

#### Scenario: No cascade path when error is single-zone

- **WHEN** FocusAttribution has an empty cascadePath (root cause did not propagate across zones)
- **THEN** the cascade path section SHALL NOT be rendered
- **AND** the existing attribution display SHALL be shown instead

#### Scenario: Cascade path hidden in rule-engine fallback mode

- **WHEN** EvalResult.analysisMode is "rule" (no FocusAttribution available)
- **THEN** the cascade path section SHALL NOT be rendered

### Requirement: Tool-level error detail in signal chain

The system SHALL preserve tool name and error summary through every layer of the signal chain (HistoryStep → SignalAnchor → TimelineEvent → PhaseInfo → Dashboard).

`SignalAnchor.label` for tool_error signals SHALL include the tool name and first 70 characters of the error result:
- Format: `"agent: first 70 chars of result"`
- Example: `"edit: hash a1b2c3 matched wrong closing brace (range_replace)"`
- NOT: `"edit error"` (current)

`TimelineEvent.label` for error events SHALL include the tool name and a brief error summary:
- Format: `"toolName: error summary"`
- Example: `"bash: command not found: python3"`
- NOT: `"Tool error"` (current)

`PhaseInfo` entries derived from tool error signals SHALL include the tool name in the phase label.

#### Scenario: Signal anchor preserves error context

- **WHEN** step 314 has agent="edit", isError=true, and result="hash a1b2c3 matched the wrong closing brace in range_replace"
- **THEN** SignalAnchor.label SHALL be "edit: hash a1b2c3 matched the wrong closing brace (range_replace)"
- **AND** SignalAnchor.type SHALL be "tool_error"
- **AND** SignalAnchor.priority SHALL be "high"

#### Scenario: Timeline event distinguishes tools

- **WHEN** messages contain tool errors from edit (hash ambiguity) and bash (network timeout)
- **THEN** TimelineEvent entries SHALL have distinct labels identifying each tool
- **AND** dashboard timeline SHALL render tool-specific error labels, not generic "Tool error"

### Requirement: Zoom candidate error type classification

Pass 2 Zoom LLM SHALL classify each candidate's error type using one of: `hash_ambiguity`, `network_timeout`, `permission_denied`, `file_not_found`, `syntax_error`, `runtime_exception`, `unknown`.

The error type SHALL be included in each `ZoneCandidate` as an `errorType` field (string). Pass 3 Synthesize SHALL use error type information when determining the cascade mechanism.

#### Scenario: edit hash ambiguity classified

- **WHEN** a Zone contains 8 edit tool errors where the agent's thinking says "matched the wrong closing brace"
- **THEN** the ZoneCandidate for those errors SHALL have `errorType: "hash_ambiguity"`
- **AND** the impactScore SHALL reflect the cascading nature of hash ambiguity errors

#### Scenario: network timeout distinguished from tool bug

- **WHEN** Zone Z1 has edit hash ambiguity errors and Zone Z2 has bash network timeouts
- **THEN** Z1 candidates SHALL have `errorType: "hash_ambiguity"`
- **AND** Z2 candidates SHALL have `errorType: "network_timeout"`
- **AND** Pass 3 Synthesize SHALL attribute the root cause to Z1 (hash_ambiguity) if the bash timeouts were caused by corrupted files from edit errors

### Requirement: Synthesize reason includes tool-level detail

Pass 3 Synthesize `reason` field SHALL include:
- The specific tool name that caused the root error
- The error type (from candidate classification)
- A concrete description of what went wrong

Counter-example (NOT acceptable): "修复连锁反应 — 26 个阶段存在错误"
Acceptable: "edit tool repeatedly matched wrong lines due to hash ambiguity on closing brace characters, causing corrupted source files that triggered cascading repair attempts across zones Z2 and Z3"

#### Scenario: Reason names the tool and error type

- **WHEN** root cause is edit tool hash ambiguity at step 314
- **THEN** `reason` SHALL contain "edit" and "hash ambiguity" (or "hash_ambiguity")
- **AND** `reason` SHALL explain the cascade mechanism (e.g., "corrupted files triggered repairs")
- **AND** `mistakeAgent` SHALL be "edit"
- **AND** `mistakeStep` SHALL be 314

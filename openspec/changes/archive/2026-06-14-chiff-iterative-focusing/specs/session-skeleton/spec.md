# session-skeleton Specification

## Purpose

确定性（无 LLM）的 session 骨架构建器。将规则引擎（analyzer.ts）的阶段检测、信号锚点、偏差分析、根因推断和工具统计结果转换为结构化的 LLM 友好骨架。骨架压缩比 ~200:1（1.8MB → 5-10KB），作为迭代聚焦管线 Pass 1 Scan 的输入。

## ADDED Requirements

### Requirement: Skeleton metadata and statistics

The system SHALL include session-level metadata and statistics in the skeleton.

The metadata SHALL include:
- `question`: session title or preview text
- `totalSteps`: number of parsed HistorySteps
- `totalMessages`: raw message count from session
- `errorRate`: from ToolStats
- `duration`: human-readable duration string
- `model`: provider/model identifier

The statistics SHALL include:
- `toolCalls`: total tool call count
- `toolErrors`: total tool error count
- `userComplaints`: number of user complaint messages detected
- `screenshotsTaken`: number of screenshot tool calls detected

#### Scenario: Skeleton includes complete metadata

- **WHEN** `buildSkeleton()` is called with steps and ruleResult from a session with 312 tool calls and 5 errors
- **THEN** the skeleton SHALL contain `toolCalls: 312` and `toolErrors: 5`
- **AND** `errorRate` SHALL be derived from toolCalls and toolErrors

### Requirement: Phase map from rule engine phases

The system SHALL map rule engine `PhaseInfo[]` into a phase map in the skeleton.

Each phase entry SHALL contain:
- `id`: "P1", "P2", ... sequential
- `label`: phase name from `PhaseInfo.label`
- `stepRange`: "start-end" format
- `status`: "ok" | "warn" | "danger" from `PhaseInfo.status`
- `toolSummary`: total tool calls and error count within the phase

The phases SHALL be ordered by their `startIdx` in ascending order.

#### Scenario: Phases mapped to skeleton

- **WHEN** ruleResult has 4 phases: P1(ok, steps 0-145), P2(warn, 146-312), P3(danger, 313-489), P4(ok, 490-600)
- **THEN** the skeleton SHALL contain exactly 4 phase entries
- **AND** entries SHALL be ordered P1, P2, P3, P4
- **AND** P3 SHALL have `status: "danger"`

### Requirement: Signal anchors from rule engine signals and deviations

The system SHALL extract signal anchor points from the rule engine's analysis results.

Signal types SHALL include:
- `user_complaint`: from user messages that match complaint patterns
- `tool_error`: from toolResult messages with isError=true
- `screenshot_divergence`: from DeviationPoint entries
- `phase_boundary`: at each PhaseInfo boundary
- `root_cause_evidence`: at evidenceIndices from RootCause entries

Each signal anchor SHALL contain:
- `stepId`: global step number
- `type`: one of the signal types above
- `label`: human-readable description (≤100 chars)
- `priority`: "high" (complaints, errors, high-severity deviations) | "medium" (phase boundaries, low-severity deviations)

#### Scenario: User complaint becomes signal anchor

- **WHEN** rule engine detected `isUserComplaint: true` at step 89 with text "完全不对"
- **THEN** the skeleton SHALL contain a signal anchor at stepId=89
- **AND** `type` SHALL be "user_complaint"
- **AND** `priority` SHALL be "high"

#### Scenario: Deviation becomes signal anchor

- **WHEN** ruleResult.deviations contains a DeviationPoint at messageIdx=312 with severity="high"
- **THEN** the skeleton SHALL contain a signal anchor at stepId matching messageIdx=312

#### Scenario: Tool error anchor preserves error detail

- **WHEN** a HistoryStep has agent="edit", isError=true, and result="hash a1b2c3 matched the wrong closing brace in range_replace"
- **THEN** the skeleton SHALL contain a signal anchor at the corresponding stepId
- **AND** `type` SHALL be "tool_error"
- **AND** `label` SHALL be "edit: hash a1b2c3 matched the wrong closing brace (range_replace)" (truncated to 100 chars if longer)
- **AND** `priority` SHALL be "high"
- **AND** the label SHALL NOT be simply "edit error"

- **AND** `type` SHALL be "screenshot_divergence"

### Requirement: Hot and cold zone partitioning

The system SHALL partition the session into Hot Zones (signal-dense regions) and Cold Zones (signal-sparse regions).

Hot Zones SHALL be constructed by:
1. Collecting all signal anchor stepIds
2. Expanding each anchor by ±5 steps
3. Merging overlapping expanded ranges
4. Resulting ranges become Hot Zones

Hot Zone entries SHALL preserve per-step detail:
- `stepId`, `agent`, `action` (≤150 chars), `thought` (≤100 chars), `result` (≤200 chars), `isError`

Cold Zones SHALL contain only statistical summaries:
- `stepRange`: "start-end"
- `toolCountByAgent`: `{ "read_file": 12, "grep": 8, ... }`
- `errorCount`: number of errors in this range
- `userMessages`: number of user messages in this range

#### Scenario: Overlapping signals merge into one hot zone

- **WHEN** signal anchors exist at steps 310, 315, and 318
- **THEN** expanded ranges (305-315, 310-320, 313-323) SHALL merge into a single Hot Zone covering steps 305-323

#### Scenario: Sparsely signaled region becomes cold zone

- **WHEN** steps 600-900 have zero signal anchors
- **THEN** a Cold Zone SHALL cover steps 600-900
- **AND** only statistical summary SHALL be included

### Requirement: Data item tracker

The system SHALL track files and assets that are operated on multiple times across the session.

A data item SHALL be tracked when it appears as:
- A `path` argument in `read_file`, `write_file`, `overwrite_file`, or `edit` tool calls
- An image/asset path in tool calls or toolResults

For each tracked item, the skeleton SHALL record:
- `dataItem`: the file path or asset identifier
- `operationCount`: total number of operations
- `stepIds`: list of step IDs where the item was operated on
- `agents`: list of unique agent names that operated on this item

Items with `operationCount >= 2` SHALL be included. Items with `operationCount > 10` SHALL be marked as "hot" with a flag.

#### Scenario: Frequently modified file is tracked

- **WHEN** `src/shaders/water.frag` is modified 12 times across steps 150, 200, 320, 480, 490, 500, 505, 510, 515, 520, 525, 530
- **THEN** the data item tracker SHALL include water.frag with `operationCount: 12`
- **AND** `stepIds` SHALL list all 12 step IDs
- **AND** the item SHALL be flagged as "hot"

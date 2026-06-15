# eval-llm-rule-attribution Specification (Delta)

## Purpose

对现有 `eval-llm-rule-attribution` 规范的增量修改。Step 7 的 LLM 规则提取输入从"全量 session 上下文"扩展为同时支持"聚焦后的问题区域上下文"。在 focus pipeline 路径中，规则提取接收 Pass 3 的归因结果和 zone 分析，而非全量 session 数据。输出格式和验证逻辑不变。

## MODIFIED Requirements

### Requirement: LLM autonomously generates rules from CHIFF context

The system SHALL replace all deterministic rule extraction with a single LLM call. The LLM SHALL receive CHIFF analysis context and autonomously identify Agent configuration issues.

**Fast path** (<500 steps, unchanged): The LLM input SHALL include the full CHIFF analysis context from the 7-step pipeline.

**Focus path** (≥500 steps): The LLM input SHALL include focused context derived from:
- Zone analysis summaries (top candidates, key data flows with anomalies per zone)
- Pass 3 FocusAttribution (mistakeAgent, mistakeStep, reason, rulesApplied, cascadePath)
- Session key fragments: steps surrounding the root cause step (±5)
- Session statistics (toolCalls, toolErrors, errorRate, userComplaints)
- Current Agent configuration excerpts (same as fast path)

The focused context SHALL NOT include:
- Full session history (only fragments around root cause)
- Complete causal graph (only anomaly summaries from relevant zones)
- All candidate errors (only top candidate from each zone + the root cause)

The LLM SHALL output the same `HarnessRule[]` format regardless of path.

#### Scenario: Fast path rule generation (unchanged)

- **WHEN** CHIFF Steps 1-6 complete successfully with full causal graph and attribution
- **THEN** Step 7 SHALL call the LLM with the complete CHIFF context
- **AND** the LLM SHALL return a `HarnessRule[]` array

#### Scenario: Focus path rule generation

- **WHEN** Pass 3 Synthesize completes with FocusAttribution and 3 ZoneAnalyses
- **THEN** Step 7 SHALL call the LLM with focused context (attribution + zone anomaly summaries + root cause fragments)
- **AND** the LLM SHALL NOT receive the full session history
- **AND** the LLM SHALL return a `HarnessRule[]` array in the same format

#### Scenario: Focus path rule generation on no-issues session

- **WHEN** Pass 1 Scan returns `noIssuesDetected: true` and Pass 2/3 are skipped
- **THEN** Step 7 SHALL still call the LLM with session statistics and key fragments
- **AND** the LLM SHALL return rules based on observable patterns in the session data
- **AND** `EvalResult.analysisMode` SHALL remain `"rule"`

### Requirement: LLM output validation and retry

The LLM output from Step 7 SHALL be validated against a Zod schema for `HarnessRule[]`. If validation fails, the system SHALL retry once with a format correction hint. After two consecutive failures, the system SHALL log a warning, return an empty array, and NOT block the eval pipeline.

In the focus path, the validation and retry logic SHALL be identical to the fast path.

Additionally, the `JSON.parse()` call in `attributeWithLLM` SHALL use `safeJsonParse()` to catch parse exceptions and return null instead of throwing. On null return, the system SHALL retry once or return an empty array.

#### Scenario: Valid LLM output passes validation (unchanged)

- **WHEN** the LLM returns a valid JSON array of HarnessRule objects
- **THEN** the rules SHALL be accepted and included in `EvalResult.rules`

#### Scenario: JSON parse failure triggers graceful retry

- **WHEN** the LLM returns truncated JSON with an unterminated string
- **THEN** `safeJsonParse()` SHALL return null
- **AND** the system SHALL retry once with a correction hint
- **AND** if retry also fails, an empty array SHALL be returned
- **AND** no exception SHALL propagate to the eval pipeline

#### Scenario: Two consecutive failures produce empty rules (unchanged)

- **WHEN** both the initial call and retry produce invalid output
- **THEN** the system SHALL log a warning
- **AND** `EvalResult.rules` SHALL be an empty array
- **AND** the eval pipeline SHALL continue normally

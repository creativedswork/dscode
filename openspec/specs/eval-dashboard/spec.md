# eval-dashboard Specification

## Purpose

Session quality diagnostic analysis for dscode. Analyzes sessions using a CHIFF causal graph pipeline (primary) with rule-engine fallback, and generates a dark-themed HTML dashboard with causal graph visualization, data flow paths, and counterfactual reasoning chains.

## Requirements

### Requirement: /eval Slash Command

The system SHALL provide a `/eval` slash command that analyzes a session and generates an HTML diagnostic dashboard. Analysis uses a CHIFF multi-step causal graph architecture: 4 LLM calls build a causal graph (subtask decomposition → subtask edges → agent OTAR nodes → agent edges), then 2 LLM calls perform counterfactual attribution (candidate set → root cause via Rule1/2/3/4). Rule engine (metadata, stats, timeline) always runs first as Step 0. If any LLM call fails, the system falls back to pure rule-engine analysis and marks the dashboard with "规则引擎分析（LLM 不可用）".

When invoked without arguments, it SHALL analyze the current session. When invoked with a session ID or prefix (minimum 8 characters), it SHALL locate and analyze that session.

#### Scenario: Evaluate current session

- **WHEN** the user types `/eval` with no arguments and a current session exists
- **THEN** the system SHALL analyze the current session's data using the CHIFF pipeline with rule-engine fallback
- **AND** generate an HTML dashboard at `~/.dscode/eval/{session_id_prefix}.html`
- **AND** automatically open the dashboard in the default browser
- **AND** display an info message with the dashboard file path and analysis mode

#### Scenario: Evaluate session by full ID

- **WHEN** the user types `/eval 00MPX37L8RW7I64DNM725JX5MK` (a valid full session ID)
- **THEN** the system SHALL locate the session file by exact ID match
- **AND** analyze it and generate the dashboard

#### Scenario: Evaluate session by prefix

- **WHEN** the user types `/eval 00MPX37L8` (at least 8 characters matching a session ID prefix)
- **THEN** the system SHALL match the session by prefix
- **AND** analyze it and generate the dashboard

#### Scenario: Session not found

- **WHEN** the user types `/eval` with an invalid or non-existent session ID
- **THEN** the system SHALL display an error message: "Session not found: {id}"
- **AND** NOT generate any dashboard file

#### Scenario: No current session and no argument

- **WHEN** the user types `/eval` with no arguments and there is no current session
- **THEN** the system SHALL display an error message: "No session to evaluate. Usage: /eval [session_id]"

### Requirement: Hybrid Analysis Architecture

The analysis SHALL use a multi-step causal-graph architecture based on CHIFF methodology:

**Step 0 — Session Parser** (`parseSessionToSteps()`): Deterministic. Parses `SerializedSession` into `HistoryStep[]` (stepId, agent, observation, thought, action, result, isError, timestamp). Extracts metadata and computes tool call statistics.

**Step 1-4 — Causal Graph Construction** (4 LLM calls): Builds a structured causal graph — subtask decomposition (Step 1), subtask edges with data transfer and failure modes (Step 2), agent nodes with OTAR quadruples and step-level data flows (Step 3), agent-to-agent edges with failure modes (Step 4). Graph assembly is deterministic (`CausalGraphStore`). If the graph is incomplete (`isGraphComplete() === false`), the system SHALL fall back to rule-engine analysis.

**Step 5-6 — Counterfactual Attribution** (2 LLM calls): Generates candidate error set (≥5 steps, Step 5) and performs single root-cause attribution using four counterfactual rules: Rule1 (control flow / loop adjudication), Rule2 (data flow traceback), Rule3 (irrecoverable point identification), Rule4 (taste / creative drift) (Step 6).

**Fallback**: If any LLM call fails (network error, timeout, JSON parse failure after retry), the system returns pure rule-engine results. The dashboard displays `analysisMode: "rule"` with a visible indicator.

#### Scenario: LLM causal-graph analysis succeeds

- **WHEN** all 6 steps complete successfully and the causal graph is built
- **THEN** phases SHALL be derived from subtask decomposition
- **AND** rootCauses SHALL include the Step 6 attribution with rules_applied
- **AND** `analysisMode` SHALL be set to `"llm"`
- **AND** the dashboard SHALL display causal graph visualization

#### Scenario: LLM analysis fails at any step

- **WHEN** any of Step 1-6 LLM calls fail and retry is exhausted
- **THEN** the system SHALL return pure rule-engine results
- **AND** `analysisMode` SHALL be set to `"rule"`
- **AND** the dashboard SHALL display "⚙ 规则引擎分析（LLM 不可用）"

### Requirement: Session Message Format Recognition

The analysis engine SHALL correctly parse dscode's actual session message format:

- Tool call messages: `role: "assistant"`, content blocks with `type: "toolCall"`, `name: string`, `arguments: object`
- Tool result messages: `role: "toolResult"`, `toolName: string`, `isError: boolean`, `details.error: string | undefined`
- Thinking: inside content blocks with `type: "thinking"` and `thinking: string` field, or top-level `msg.thinking` field
- User messages: `role: "user"`, content blocks with `type: "text"`

#### Scenario: Tool calls correctly counted

- **WHEN** a session contains messages with `type: "toolCall"` content blocks
- **THEN** the system SHALL detect and count them via `getToolCallNames()`
- **AND** extract tool names from `block.name`

#### Scenario: Tool errors correctly detected

- **WHEN** a `toolResult` message has `isError: true` or `details.error` is present
- **THEN** `isToolResultError()` SHALL return true

### Requirement: Session Metadata Extraction

The analysis engine SHALL extract the following metadata from a SerializedSession: session ID, title, model name (provider/modelId), total message count, time span (from createdAt to updatedAt), project path, startedAt, and endedAt. Timestamps SHALL be formatted as "YYYY-MM-DD HH:mm:ss". Duration SHALL be formatted as "Xh Ym" or "< 1m". Null/NaN timestamps SHALL produce "unknown".

#### Scenario: Metadata extraction from valid session

- **WHEN** a SerializedSession with version 1 or 2 is loaded
- **THEN** the system SHALL extract sessionId, title, model, totalMessages, duration, projectPath, startedAt, endedAt
- **AND** all metadata fields SHALL be displayed in the dashboard header

### Requirement: Tool Call Statistics

The analysis engine SHALL count and categorize all tool calls in the session: total tool calls (from `toolCall` blocks), tool errors (from `toolResult` messages with `isError: true` or `details.error`), error rate as a percentage string ("XX.X%"), screenshots taken (tool names matching "screenshot"), and user complaint messages count (matching Chinese complaint patterns like /不对/, /错了/, /不要/).

#### Scenario: Tool call statistics with mixed success/failure

- **WHEN** a session contains 52 tool calls with 10 errors
- **THEN** the system SHALL report total: 52, errors: 10, error rate: "19.2%"
- **AND** display these as summary cards in the dashboard

### Requirement: Phase Auto-Detection

The analysis engine SHALL automatically divide a session into phases. In rule-engine mode: based on intent signals in assistant thinking text (via `getThinking()`), tool call pattern mutations, and user complaint messages. In LLM mode: phases SHALL be derived from subtask decomposition (Step 1) rather than regex-based signals. Each phase SHALL have a label, message range [startIdx, endIdx], status (ok/warn/danger), a summary description, and a breakdown of tool calls within the phase.

#### Scenario: Typical multi-phase session

- **WHEN** a session contains distinct build, tuning, deviation, reset, and rebuild phases
- **THEN** each phase SHALL be detected with appropriate boundaries
- **AND** phases with errors or complaints SHALL be marked "warn" or "danger"

#### Scenario: Session with no clear phase boundaries

- **WHEN** a session has minimal thinking text or tool calls
- **THEN** the system SHALL produce a single phase spanning all messages labeled "Full Session"

#### Scenario: Phases mapped from subtasks (LLM mode)

- **WHEN** Step 1 produced subtasks S1("探索"), S2("实现"), S3("修复"), S4("调整")
- **THEN** the phase timeline SHALL show these 4 phases with correct step ranges
- **AND** status SHALL be "danger" for subtasks containing user complaints or tool errors

### Requirement: Keyword Deviation Detection

The analysis engine SHALL extract target keywords from the user's first message and session title using `extractTargetKeywords()`, extract visual keywords from screenshot descriptions in toolResult messages using `extractScreenshotKeywords()`, and compute keyword drift via `jaccardDistance()`. When the Jaccard distance between target and screenshot keywords exceeds 0.7, the system SHALL flag the message index as a deviation point with severity "low" (<0.8), "medium" (0.8-0.9), or "high" (>0.9).

#### Scenario: Screenshot description diverges from target

- **WHEN** the target keywords are ["湿地", "反射", "地面"] and a screenshot description contains ["云状纹理", "雾气", "半透明"]
- **THEN** the system SHALL detect a keyword drift and flag it as a deviation point

### Requirement: Root Cause Inference

The analysis engine SHALL infer root causes. In rule-engine mode: from deviation points and phase transitions, detecting patterns "效果过载", "截图感知盲区", "需求蔓延", and "修复连锁反应". In LLM mode: root cause SHALL be the Step 6 single attribution with counterfactual rules applied (Rule1/2/3/4). Root causes SHALL include a title, description, list of evidence message indices, and severity (primary/secondary).

#### Scenario: Effect overload pattern detected

- **WHEN** three or more overlapping visual mechanisms are enabled in close succession
- **THEN** the system SHALL report a primary root cause "效果过载" with evidence message indices

### Requirement: dscode-Specific Improvement Suggestions

The analysis engine SHALL generate suggestions focused on improving the dscode agent itself, not generic user advice. Each suggestion SHALL reference specific session evidence and propose a concrete agent design change.

Rule-engine suggestions SHALL target specific anti-patterns with concrete system prompt / workflow changes. LLM suggestions SHALL be free-form in Chinese, 2-3 sentences each, citing message indices and focusing on agent design improvements (system prompt, workflow, tool-use strategy, error recovery, self-awareness).

#### Scenario: Suggestions for a session with perception blind spot

- **WHEN** a session has deviations and a "截图感知盲区" root cause
- **THEN** the rule engine SHALL suggest adding a screenshot-vs-goal verification step to agent workflow
- **AND** the suggestion SHALL cite specific message indices as evidence

### Requirement: Dashboard HTML Generation

The system SHALL generate a self-contained HTML file at `~/.dscode/eval/{session_id_prefix}.html` with dark theme, inline CSS, and no external dependencies. The dashboard SHALL contain: header with metadata and analysis mode badge ("🤖 CHIFF Causal Graph Analysis" or "⚙ 规则引擎分析（LLM Unavailable）"), summary stat cards (message count, tool calls, error rate, screenshots, complaints, deviations) with color coding (ok=#3fb950, warn=#d2991d, danger=#f85149), phase timeline with horizontal colored bars, **causal graph visualization section** (LLM mode only — bar chart showing subtask→subtask dependencies with color-coded nodes), **data flow paths section** (LLM mode only — table showing key data items and their complete production→consumption chains), **Rule reasoning chain section** (LLM mode only — Rule1/2/3/4 application with evidence), root cause analysis section, deviations section, suggestions section, and event timeline.

#### Scenario: Dashboard with causal graph

- **WHEN** a session analysis completes with a full causal graph (LLM mode)
- **THEN** the generated HTML SHALL include a causal graph visualization
- **AND** SHALL include a data flow paths table
- **AND** SHALL include a Rule reasoning chain section

#### Scenario: Dashboard in rule-engine fallback mode

- **WHEN** the causal graph could not be built and rule engine was used
- **THEN** the dashboard SHALL omit the causal graph, data flow paths, and Rule reasoning chain sections
- **AND** SHALL display the rule-engine analysis flag

#### Scenario: HTML output is safe

- **WHEN** the session contains user messages with HTML special characters
- **THEN** `escapeHtml()` SHALL escape all text and return "" for null/undefined inputs

### Requirement: Causal Graph Visualization

When `analysisMode` is "llm" and `causalGraph` is present, the dashboard SHALL render a visualization showing:
- Subtask nodes as colored horizontal bars with name and step range, color-coded by status (green=ok, yellow=warn, red=danger)
- Subtask edges as labeled dependency lines
- Agent counts and key actions per subtask

The visualization SHALL use inline styles compatible with the dark theme and be responsive within the dashboard container.

#### Scenario: Causal graph rendered for multi-subtask session

- **WHEN** the causal graph has 3+ subtasks with edges and agent nodes
- **THEN** the visualization SHALL display all subtasks with correct step ranges
- **AND** edges SHALL be labeled with dependency type
- **AND** all text SHALL be legible at dashboard width (max 1200px)

### Requirement: Data Flow Paths Table

When `causalGraph` is present, the dashboard SHALL render a table showing key data items and their complete flow paths. Each row SHALL display: data_item name, producer→consumer path, correctness assessment, and a visual indicator.

#### Scenario: Data flow table for session with file operations

- **WHEN** the causal graph contains data flows tracking file reads and writes
- **THEN** each tracked file SHALL appear as a row in the data flow table
- **AND** the complete chain from first read to last write SHALL be visible

### Requirement: Rule Reasoning Chain Display

When `attribution` and `rulesApplied` are present, the dashboard SHALL display a reasoning chain section showing:
- Final attribution (mistakeAgent + mistakeStep + reason)
- Each applied Rule (Rule1/2/3/4) with its description

#### Scenario: Rule reasoning chain for a Rule2 attribution

- **WHEN** the root cause was attributed via Rule 2 (data flow)
- **THEN** the reasoning chain SHALL show the data item traced, its source step, its consumption step, and why the consumer was at fault
- **AND** Rule2 SHALL be highlighted as a primary rule

### Requirement: Dashboard Auto-Open

After generating the dashboard HTML file, the system SHALL attempt to open it in the user's default browser using the platform-appropriate command. On failure, the system SHALL still display the file path without throwing.

#### Scenario: Dashboard opens in browser on macOS

- **WHEN** running on macOS and the HTML file is written successfully
- **THEN** the system SHALL execute `open <filepath>` to launch the default browser

#### Scenario: Open command fails gracefully

- **WHEN** the browser open command fails for any reason
- **THEN** the system SHALL still display the file path in an info message
- **AND** NOT throw an unhandled error

### Requirement: Eval Result Data Structure

The analysis engine SHALL return an `EvalResult` object with fields: `metadata` (SessionMeta), `stats` (ToolStats), `phases` (PhaseInfo[]), `deviations` (DeviationPoint[]), `rootCauses` (RootCause[]), `suggestions` (string[]), `timeline` (TimelineEvent[]), `analysisMode` ("llm" | "rule"), `causalGraph` (CausalGraphSnapshot | null — present only in LLM mode), `attribution` (Attribution | null — present only in LLM mode), and `rulesApplied` (string[] — Rule identifiers, present only in LLM mode).

#### Scenario: Complete EvalResult after LLM causal-graph analysis

- **WHEN** the full 6-step pipeline completes successfully
- **THEN** `analysisMode` SHALL be "llm"
- **AND** `causalGraph` SHALL be non-null containing subtask, edge, agent, and dataflow summaries
- **AND** `attribution` SHALL be non-null with mistake_agent, mistake_step, reason, rules_applied
- **AND** `rulesApplied` SHALL be a non-empty array

#### Scenario: EvalResult after rule-engine fallback

- **WHEN** LLM analysis fails and rule engine is used
- **THEN** `analysisMode` SHALL be "rule"
- **AND** `causalGraph` SHALL be null
- **AND** `attribution` SHALL be null
- **AND** `rulesApplied` SHALL be an empty array

### Requirement: Session Compression for LLM

Before sending data to the LLM, the system SHALL compress the session via `compactSession()`. The compression strategy SHALL:
- Keep full user message text (typically 30-400 chars)
- Give key assistant thinking 600 chars, ordinary 200 chars, via `getThinking()`
- Extract tool names plus key arguments (file paths, command snippets, content previews)
- Keep first 500 chars of all tool results; annotate oversized results with `[toolName output: N chars]`
- Keep screenshot descriptions up to 500 chars
- Skip empty assistant messages to reduce noise

## ADDED Requirements

### Requirement: /eval Slash Command

The system SHALL provide a `/eval` slash command that analyzes a session and generates an HTML diagnostic dashboard. Analysis uses a hybrid architecture: Layer 1 rule engine (metadata, stats, timeline) always runs first; Layer 2 LLM analysis (phase detection, deviation detection, root cause inference, suggestions) runs via `completeSimple()` — a direct model API call with zero agent state manipulation. If the LLM call fails, the system falls back to pure rule-engine analysis and marks the dashboard with "规则引擎分析（LLM 不可用）".

When invoked without arguments, it SHALL analyze the current session. When invoked with a session ID or prefix (minimum 8 characters), it SHALL locate and analyze that session.

#### Scenario: Evaluate current session

- **WHEN** the user types `/eval` with no arguments and a current session exists
- **THEN** the system SHALL analyze the current session's data using the hybrid architecture
- **AND** generate an HTML dashboard at `~/.dscode/eval/{session_id_prefix}.html`
- **AND** automatically open the dashboard in the default browser
- **AND** display an info message with the dashboard file path

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

The analysis SHALL use a two-layer architecture:

**Layer 1 — Rule Engine** (`analyzeSession()`): Always runs first. Extracts metadata (sessionId, title, model, duration), computes tool call statistics (total calls, errors, error rate from `toolResult` messages with `isError: true` or `details.error`), detects phases via regex-based intent signals in thinking text, detects keyword deviations via Jaccard distance on Chinese visual keywords, infers root causes (效果过载, 截图感知盲区, 需求蔓延, 修复连锁反应), and generates dscode-specific improvement suggestions.

**Layer 2 — LLM Analysis** (`analyzeWithLLM()`): Calls the model directly via `completeSimple()` from `@mariozechner/pi-ai` — no agent state manipulation, no session side effects. Uses a compressed session log as input and outputs structured JSON for phases, deviations, root causes, and suggestions. LLM results are merged with rule-engine metadata/stats via `mergeResults()`.

**Fallback**: If the LLM call fails (network error, timeout, JSON parse failure), the system returns pure rule-engine results. The dashboard displays `analysisMode: "rule"` with a visible indicator.

#### Scenario: LLM analysis succeeds

- **WHEN** `analyzeWithLLM()` is called and the model returns valid JSON
- **THEN** phases, deviations, rootCauses, and suggestions SHALL use LLM results
- **AND** metadata, stats, and timeline SHALL use rule-engine results
- **AND** `analysisMode` SHALL be set to `"llm"`

#### Scenario: LLM analysis fails

- **WHEN** `analyzeWithLLM()` is called and the model call fails or returns invalid JSON
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

The analysis engine SHALL automatically divide a session into phases based on intent signals in assistant thinking text (via `getThinking()`), tool call pattern mutations (tool name set changes ≥3 count or ≥2 new/removed), and user complaint messages. Each phase SHALL have a label, message range [startIdx, endIdx], status (ok/warn/danger), a summary description, and a breakdown of tool calls within the phase.

#### Scenario: Typical multi-phase session

- **WHEN** a session contains distinct build, tuning, deviation, reset, and rebuild phases
- **THEN** each phase SHALL be detected with appropriate boundaries
- **AND** phases with errors or complaints SHALL be marked "warn" or "danger"

#### Scenario: Session with no clear phase boundaries

- **WHEN** a session has minimal thinking text or tool calls
- **THEN** the system SHALL produce a single phase spanning all messages labeled "Full Session"

### Requirement: Keyword Deviation Detection

The analysis engine SHALL extract target keywords from the user's first message and session title using `extractTargetKeywords()`, extract visual keywords from screenshot descriptions in toolResult messages using `extractScreenshotKeywords()`, and compute keyword drift via `jaccardDistance()`. When the Jaccard distance between target and screenshot keywords exceeds 0.7, the system SHALL flag the message index as a deviation point with severity "low" (<0.8), "medium" (0.8-0.9), or "high" (>0.9).

#### Scenario: Screenshot description diverges from target

- **WHEN** the target keywords are ["湿地", "反射", "地面"] and a screenshot description contains ["云状纹理", "雾气", "半透明"]
- **THEN** the system SHALL detect a keyword drift and flag it as a deviation point

### Requirement: Root Cause Inference

The analysis engine SHALL infer root causes from deviation points and phase transitions. Root causes SHALL include a title, description, list of evidence message indices, and severity (primary/secondary). The engine SHALL detect patterns: "效果过载" (≥3 messages with ≥2 overlapping visual mechanisms), "截图感知盲区" (deviations where nearby thinking text doesn't acknowledge anomaly keywords), "需求蔓延" (≥3 phases with danger phases present), and "修复连锁反应" (≥3 warn/danger phases).

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

The system SHALL generate a self-contained HTML file at `~/.dscode/eval/{session_id_prefix}.html` with dark theme, inline CSS, and no external dependencies. The dashboard SHALL contain: header with metadata and analysis mode badge ("🤖 LLM 深度分析" or "⚙ 规则引擎分析（LLM 不可用）"), summary stat cards (message count, tool calls, error rate, screenshots, complaints, deviations) with color coding (ok=#3fb950, warn=#d2991d, danger=#f85149), phase timeline with horizontal colored bars, root cause analysis section, deviations section, suggestions section, and event timeline.

#### Scenario: Dashboard for a session with deviations

- **WHEN** a session analysis completes with detected phases, deviations, and root causes
- **THEN** the generated HTML SHALL display all sections with appropriate color coding
- **AND** the analysis mode SHALL be clearly indicated

#### Scenario: HTML output is safe

- **WHEN** the session contains user messages with HTML special characters
- **THEN** `escapeHtml()` SHALL escape all text and return "" for null/undefined inputs

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

The analysis engine SHALL return an `EvalResult` object with fields: `metadata` (SessionMeta), `stats` (ToolStats), `phases` (PhaseInfo[]), `deviations` (DeviationPoint[]), `rootCauses` (RootCause[]), `suggestions` (string[]), `timeline` (TimelineEvent[]), and `analysisMode` ("llm" | "rule").

#### Scenario: Complete EvalResult after analysis

- **WHEN** `analyzeSession(data)` completes successfully
- **THEN** the returned EvalResult SHALL have all fields populated
- **AND** `stats.errorRate` SHALL be "XX.X%" format
- **AND** `analysisMode` SHALL be "rule" for rule-engine-only, "llm" for LLM-assisted

### Requirement: Session Compression for LLM

Before sending data to the LLM, the system SHALL compress the session via `compactSession()`. The compression strategy SHALL:
- Keep full user message text (typically 30-400 chars)
- Give key assistant thinking 600 chars, ordinary 200 chars, via `getThinking()`
- Extract tool names plus key arguments (file paths, command snippets, content previews)
- Keep first 500 chars of all tool results; annotate oversized results with `[toolName output: N chars]`
- Keep screenshot descriptions up to 500 chars
- Skip empty assistant messages to reduce noise

#### Scenario: Session compressed for LLM with tool results

- **WHEN** a 440-message session is compressed
- **THEN** tool results SHALL be included (not discarded)
- **AND** key thinking SHALL receive expanded character budget
- **AND** tool arguments SHALL be extracted for path/command fields

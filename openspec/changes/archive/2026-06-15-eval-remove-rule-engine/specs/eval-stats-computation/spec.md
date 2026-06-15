## ADDED Requirements

### Requirement: Pure computational stats extraction

The system SHALL provide a `computeStats()` function that extracts metadata and tool call statistics from a `SerializedSession` without any inference, heuristics, or pattern matching. This function is pure computation — counting, formatting, and data extraction only.

The function SHALL accept `SerializedSession` and return `SessionMeta` and `ToolStats`:

- `SessionMeta`: sessionId, title, model (provider/modelId), totalMessages, duration (formatted), projectPath, startedAt, endedAt
- `ToolStats`: toolCalls (count of all `toolCall` blocks), toolErrors (count of `toolResult` messages with `isError: true`), errorRate (percentage string), screenshotsTaken (tool names containing "screenshot"), userComplaints (always 0 — complaint detection is LLM territory)

The function SHALL NOT:
- Detect phases or phase boundaries
- Compute Jaccard distance or keyword overlap
- Infer root causes
- Match user complaint patterns
- Extract visual keywords
- Compact or summarize session content

#### Scenario: Stats computed from valid session

- **WHEN** a `SerializedSession` contains 66 messages with 67 tool calls and 8 tool errors
- **THEN** `computeStats()` SHALL return `toolCalls: 67`, `toolErrors: 8`, `errorRate: "11.9%"`
- **AND** `metadata.totalMessages` SHALL be 66
- **AND** `metadata.model` SHALL be `"deepseek/deepseek-v4-pro"`
- **AND** `stats.userComplaints` SHALL be 0

#### Scenario: Stats with no tool calls

- **WHEN** a session has zero `toolCall` blocks
- **THEN** `toolCalls` SHALL be 0, `toolErrors` SHALL be 0, `errorRate` SHALL be `"0.0%"`
- **AND** `screenshotsTaken` SHALL be 0

#### Scenario: Stats with null timestamps

- **WHEN** a session has null or NaN `createdAt` or `updatedAt` timestamps
- **THEN** `startedAt` and `endedAt` SHALL be `"unknown"`
- **AND** `duration` SHALL be `"< 1m"`

### Requirement: Stats module is independent of eval inference

The `computeStats()` function SHALL be importable without triggering any side effects. It SHALL NOT depend on `analyzer.ts`, `llm.ts`, focus pipeline, or any inference-related module. It SHALL only depend on `SerializedSession` types and Node.js standard library.

#### Scenario: Stats module has no inference dependencies

- **WHEN** `stats.ts` is imported in isolation
- **THEN** no LLM calls SHALL be made
- **AND** no rule engine logic SHALL be executed
- **AND** no file system reads SHALL occur (pure function of its input)

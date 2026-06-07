## ADDED Requirements

### Requirement: Tool call extraction from AssistantMessage
`rebuildDisplayMessages()` SHALL extract `ToolCall` blocks from `AssistantMessage.content` and populate the `DisplayMessage.tools` field as `{ name, args, result, isError }[]` entries. Each `ToolCall` block SHALL produce a tool entry with `name` from `ToolCall.name`, `args` from `JSON.stringify(ToolCall.arguments).slice(0, 80)`, and initial `result: ""` / `isError: false`.

#### Scenario: Assistant message with single tool call
- **WHEN** an `AssistantMessage` has `content: [{ type: "toolCall", id: "tc1", name: "read_file", arguments: { path: "/foo" } }]`
- **THEN** the resulting `DisplayMessage.tools` SHALL contain one entry with `name: "read_file"`, `args` being the truncated JSON of `{ path: "/foo" }`, `result: ""`, and `isError: false`

#### Scenario: Assistant message with multiple tool calls
- **WHEN** an `AssistantMessage` has `content: [toolCall_A, toolCall_B]`
- **THEN** the resulting `DisplayMessage.tools` SHALL contain two entries in the same order they appear in the content array

#### Scenario: Assistant message with mixed content blocks
- **WHEN** an `AssistantMessage` has `content: [{ type: "thinking", thinking: "..." }, { type: "text", text: "Let me check" }, { type: "toolCall", ... }]`
- **THEN** the text block SHALL still contribute to `DisplayMessage.content` and the toolCall block SHALL populate `DisplayMessage.tools`

#### Scenario: Assistant message with no tool calls
- **WHEN** an `AssistantMessage` has content with only `TextContent` and/or `ThinkingContent` blocks
- **THEN** `DisplayMessage.tools` SHALL be `undefined` (no tool entries)

### Requirement: Thinking content extraction from AssistantMessage
`rebuildDisplayMessages()` SHALL extract `ThinkingContent` blocks from `AssistantMessage.content` and concatenate their `thinking` strings into `DisplayMessage.thinking`, joined by `"\n\n"` when multiple blocks exist.

#### Scenario: Assistant message with single thinking block
- **WHEN** an `AssistantMessage` has `content: [{ type: "thinking", thinking: "Hmm, let me think..." }]`
- **THEN** `DisplayMessage.thinking` SHALL be `"Hmm, let me think..."`

#### Scenario: Assistant message with multiple thinking blocks
- **WHEN** an `AssistantMessage` has `content: [thinking_A, thinking_B]`
- **THEN** `DisplayMessage.thinking` SHALL be `"<thinking_A.text>\n\n<thinking_B.text>"`

#### Scenario: Assistant message with no thinking
- **WHEN** an `AssistantMessage` has no `ThinkingContent` blocks
- **THEN** `DisplayMessage.thinking` SHALL be `undefined`

### Requirement: ToolResultMessage matching and deduplication
`rebuildDisplayMessages()` SHALL match `ToolResultMessage` entries to the `ToolCall` blocks in the nearest preceding `AssistantMessage` by `toolCallId` → `ToolCall.id`, filling in `result` and `isError` on the matched tool entry. Matched `ToolResultMessage` entries SHALL be excluded from the output `DisplayMessage[]`.

#### Scenario: Successful tool result match
- **WHEN** an `AssistantMessage` has tool call `{ id: "tc1", name: "read_file" }` followed immediately by `ToolResultMessage { toolCallId: "tc1", toolName: "read_file", content: [{ type: "text", text: "hello" }], isError: false }`
- **THEN** the tool entry for `read_file` SHALL have `result: "hello"` and `isError: false`
- **AND** the `ToolResultMessage` SHALL NOT appear as a standalone `DisplayMessage`

#### Scenario: Error tool result match
- **WHEN** a `ToolResultMessage` has `isError: true` and content `[{ type: "text", text: "connection refused" }]`
- **THEN** the matched tool entry SHALL have `result: "connection refused"` and `isError: true`

#### Scenario: Unmatched ToolResultMessage preserved
- **WHEN** a `ToolResultMessage` appears without a preceding `AssistantMessage` with matching `toolCallId`
- **THEN** it SHALL be emitted as a standalone `DisplayMessage` with `role` and `content` extracted from its content blocks (fallback to existing behavior)

#### Scenario: Tool result with only images
- **WHEN** a `ToolResultMessage` has content with only `ImageContent` blocks and no text
- **THEN** the matched tool entry SHALL have `result: ""` (since `ToolCallEntry.result` is always a string)
- **AND** the images SHALL be extracted into the tool entry's `images` field if the type supports it

#### Scenario: Multiple tool results matched to single assistant message
- **WHEN** an `AssistantMessage` has tool calls `[tc1, tc2]` followed by `ToolResultMessage(toolCallId: tc1)` and `ToolResultMessage(toolCallId: tc2)`
- **THEN** both tool entries SHALL have their results filled
- **AND** both `ToolResultMessage` entries SHALL be excluded from output

### Requirement: Content extraction remains text-only
For `AssistantMessage`, only `TextContent` blocks (`type === "text"`) SHALL contribute to `DisplayMessage.content`. `ToolCall` and `ThinkingContent` blocks SHALL NOT appear in the content string.

#### Scenario: Tool call block excluded from content
- **WHEN** an `AssistantMessage` has `content: [{ type: "text", text: "I'll search" }, { type: "toolCall", ... }]`
- **THEN** `DisplayMessage.content` SHALL be `"I'll search"` (not containing any tool call representation)

### Requirement: UserMessage and ToolResultMessage text extraction unchanged
For `UserMessage` and standalone `ToolResultMessage`, text extraction SHALL continue to use the existing `filter(b => b.type === "text")` logic. The `role` for standalone `ToolResultMessage` fallback SHALL remain `"toolResult"` (later mapped to non-user styling in the frontend).

## Purpose

Defines the canonical shared conversation data model — including UIMessage, ToolCallEntry, and ContentBlock types — and the pure conversationReducer function consumed by both TUI and Web UI to eliminate type drift and duplicate logic.
## Requirements
### Requirement: Canonical UIMessage type
The shared module SHALL define a canonical `UIMessage` type that represents a single conversation message with all possible content types (text, thinking, tool calls, images, streaming state) and an optional creation timestamp.

#### Scenario: User message
- **WHEN** a user sends a message
- **THEN** the `UIMessage` has `role: "user"`, `content: string`, optional `images: ImageAttachment[]`

#### Scenario: Assistant message with streaming
- **WHEN** the assistant is streaming a response
- **THEN** the `UIMessage` has `role: "assistant"`, `content: string`, `thinking?: string`, `tools?: ToolCallEntry[]`, `isStreaming: true`

#### Scenario: Assistant message finalized
- **WHEN** the assistant finishes a response
- **THEN** the `UIMessage` has `isStreaming: false` and all accumulated content

#### Scenario: System message
- **WHEN** a system event occurs
- **THEN** the `UIMessage` has `role: "system"`, `content: string`

#### Scenario: Message carries creation timestamp
- **WHEN** a message is created by the reducer
- **THEN** the `UIMessage` SHALL have an optional `createdAt?: number` field containing the epoch millisecond timestamp of message creation
- **AND** when `createdAt` is absent, consumers SHALL treat the message as having no known creation time

### Requirement: Canonical ToolCallEntry type
The shared module SHALL define a canonical `ToolCallEntry` type representing a single tool invocation within an assistant message.

#### Scenario: Tool call with result
- **WHEN** a tool call completes
- **THEN** the `ToolCallEntry` has `name: string`, `args: string`, `result: string`, `isError: boolean`, and optional `mcpApp?: McpAppInfo`

#### Scenario: Tool call in progress
- **WHEN** a tool call starts but hasn't completed
- **THEN** the `ToolCallEntry` has `result: ""` indicating pending state

### Requirement: Conversation reducer function
The shared module SHALL export a pure function `conversationReducer(prev: UIMessage[], event: ServerEvent): UIMessage[]` that transforms message state in response to server events.

#### Scenario: New streaming assistant message
- **WHEN** `assistant_start` event is received
- **THEN** the reducer appends a new `UIMessage` with `role: "assistant"`, `isStreaming: true`, empty content and thinking

#### Scenario: Thinking delta accumulation
- **WHEN** `thinking_delta` event is received and last message is streaming
- **THEN** the reducer appends delta to the last message's `thinking` field

#### Scenario: Text delta accumulation
- **WHEN** `text_delta` event is received and last message is streaming
- **THEN** the reducer appends delta to the last message's `content` field

#### Scenario: Tool start in streaming message
- **WHEN** `tool_start` event is received and last message is streaming
- **THEN** the reducer appends a new `ToolCallEntry` with empty result to the last message's `tools` array

#### Scenario: Tool end updates matching entry
- **WHEN** `tool_end` event is received
- **THEN** the reducer finds the matching `ToolCallEntry` by name with empty result in the last streaming message and fills in `result` and `isError`

#### Scenario: MCP app info attaches to tool
- **WHEN** `mcp_app` event is received
- **THEN** the reducer finds the matching `ToolCallEntry` by `toolName` and sets its `mcpApp` field

#### Scenario: Assistant end finalizes message
- **WHEN** `assistant_end` event is received
- **THEN** the reducer sets `isStreaming: false` on the last message

#### Scenario: User message added
- **WHEN** `user_message` event is received
- **THEN** the reducer appends a new `UIMessage` with `role: "user"` and the event's text

#### Scenario: Clear conversation resets state
- **WHEN** `clear_conversation` event is received
- **THEN** the reducer returns an empty array

#### Scenario: Ready event populates initial messages
- **WHEN** `ready` event is received with `messages` array
- **THEN** the reducer maps each conversation message to a `UIMessage`, normalizing content to string format

#### Scenario: User message records creation timestamp
- **WHEN** `user_message` event is received with an optional `createdAt` field
- **THEN** the reducer SHALL set `createdAt` on the resulting `UIMessage` to the event's `createdAt` value if present, or leave it undefined otherwise

#### Scenario: Assistant message records creation timestamp
- **WHEN** `updateLastOrCreate` creates or updates a streaming assistant message
- **THEN** the reducer SHALL set `createdAt` on the new `UIMessage` to a provided timestamp value if present, preserving any existing `createdAt` on updated messages

#### Scenario: Ready event propagates timestamps
- **WHEN** `ready` event is received with `messages` array where individual messages have an optional `createdAt` field
- **THEN** the reducer SHALL set `UIMessage.createdAt` to the message's `createdAt` value if present, or leave it undefined otherwise

### Requirement: Reducer is pure and side-effect-free
The `conversationReducer` function SHALL be a pure function with no side effects, no external dependencies, and no DOM/Node API usage.

#### Scenario: Same input produces same output
- **WHEN** called with identical `prev` and `event` arguments
- **THEN** the returned array is structurally identical

#### Scenario: No mutation of input
- **WHEN** called with a `prev` array
- **THEN** the original `prev` array is not modified


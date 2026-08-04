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

### Requirement: Canonical AgentActivity type

共享 UI 模块 SHALL 定义 canonical `AgentActivity`，包含 agentId、parentAgentId、
parentSessionId、Application、attachment、Agent state、输入、输出、错误、进度和
时间信息。该类型 MUST 为纯 TypeScript 数据结构，不依赖 DOM、Node API 或 Runtime。

#### Scenario: Running Agent Activity
- **WHEN** UI 接收 running Agent snapshot
- **THEN** `AgentActivity` 包含 agentId、parentSessionId、application、attachment、state 和 input

#### Scenario: Completed Agent Activity
- **WHEN** UI 接收 completed Agent snapshot
- **THEN** `AgentActivity` 包含 endedAt、可选 output，且可以计算 duration

### Requirement: UIMessage 支持 Agent role

canonical `UIMessage` SHALL 支持 `role: "agent"`，并在该 role 下携带
`agentActivity`。Agent role MUST 与 user、assistant 和 system role 可判别。

#### Scenario: Agent UI message
- **WHEN** reducer 创建 Agent Activity 消息
- **THEN** 消息 role 为 agent、agentActivity.agentId 有值
- **AND** 消息不被解释为 assistant response

### Requirement: Reducer upsert Agent Activity

`conversationReducer` SHALL 处理 `agent_activity` ServerEvent，并按 agentId
不可变地插入或更新 Agent UIMessage。

#### Scenario: 首次 Activity snapshot
- **WHEN** reducer 收到未知 agentId 的 `agent_activity`
- **THEN** 返回数组追加一条 role=agent 的 UIMessage

#### Scenario: 后续 Activity snapshot
- **WHEN** reducer 收到已存在 agentId 的 `agent_activity`
- **THEN** 替换该 UIMessage 的 agentActivity snapshot
- **AND** 其他消息与原输入数组保持不变

#### Scenario: 重复终态 snapshot
- **WHEN** reducer 两次收到同一 agentId 的相同 completed snapshot
- **THEN** conversation 中仍只有一条对应 Agent UIMessage

### Requirement: Ready 恢复 Agent Activity

`ready` 事件中的 `ConversationMessage[]` SHALL 支持 Agent Activity，并由 reducer
恢复为 canonical UIMessage。

#### Scenario: Session ready 包含 Agent Activity
- **WHEN** ready messages 中包含 role=agent 的记录
- **THEN** reducer 保留 agentActivity 的状态、输出和时间字段
- **AND** 不把该记录转换为 assistant role


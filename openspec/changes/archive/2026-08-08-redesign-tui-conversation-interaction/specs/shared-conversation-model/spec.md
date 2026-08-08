## ADDED Requirements

### Requirement: Canonical ToolResultProjection 保留摘要与完整详情

共享 UI 模块 SHALL 定义纯 TypeScript `ToolResultProjection`，将紧凑 `summary` 与
lossless `text` 或 `ref` 分离。Projection MUST 至少包含 summary，并 SHALL 在完整
结果不适合内联时使用可解析的 owner/toolCallId reference。

#### Scenario: 短 Tool result
- **WHEN** Tool result 适合以内联文本投影
- **THEN** ToolResultProjection 包含 summary 与完整 text
- **AND** summary formatter 不修改 text

#### Scenario: 大 Tool result
- **WHEN** Tool result 超过 inline projection budget
- **THEN** ToolResultProjection 包含 summary、charCount、lineCount 和 result ref
- **AND** ref 至少标识 owner 类型、owner ID 与 toolCallId
- **AND** 权威结果保留在 Session transcript 或 Agent Process Store

#### Scenario: UI 限制可见行
- **WHEN** TUI 或 Web 只渲染 Tool result 的一个 viewport
- **THEN** renderer 只限制当前 frame 的行范围
- **AND** MUST NOT 用截断文本覆盖 ToolResultProjection

### Requirement: TUI 与 Web 消费同一 canonical conversation transition

TUI 与 Web SHALL 使用相同的 canonical conversation action/reducer 语义处理 Thinking、
Main Tool、Agent Activity 和 history-ready snapshot。UI adapters MAY 使用不同传输，
但 MUST NOT 独立实现不兼容的 message matching 或 result truncation 规则。

#### Scenario: Main Tool 在两个 UI 中完成
- **WHEN** 相同 toolCallId 的 Tool end action 到达
- **THEN** TUI 和 Web 均按 toolCallId 更新原 ToolCallEntry
- **AND** 两者保留相同 status、summary 与 result detail identity

#### Scenario: 历史 Session 恢复
- **WHEN** display reconstruction 生成 history-ready canonical messages
- **THEN** TUI 和 Web renderer 消费相同 UIMessage/AgentActivity 数据
- **AND** TUI 不建立独立的 replay-only Tool matching 规则

## MODIFIED Requirements

### Requirement: Canonical ToolCallEntry type

The shared module SHALL define a canonical `ToolCallEntry` type representing a
single tool invocation within an assistant message. Each entry MUST have a stable
`toolCallId`; it SHALL retain compact display fields and MAY carry a lossless
`resultDetail: ToolResultProjection`.

#### Scenario: Tool call with result
- **WHEN** a tool call completes
- **THEN** the `ToolCallEntry` has `toolCallId: string`, `name: string`,
  `args: string`, `result: string`, `isError: boolean`, and optional
  `mcpApp?: McpAppInfo`
- **AND** it MAY include `resultDetail` with full inline text or a resolvable ref

#### Scenario: Tool call in progress
- **WHEN** a tool call starts but hasn't completed
- **THEN** the `ToolCallEntry` has its stable toolCallId and `result: ""`
  indicating pending state

#### Scenario: Parallel same-name Tools
- **WHEN** two Tool Calls have the same name and run in parallel
- **THEN** they remain distinct by toolCallId
- **AND** completion of one MUST NOT update the other

### Requirement: Conversation reducer function

The shared module SHALL export a pure function `conversationReducer(prev:
UIMessage[], event: ServerEvent): UIMessage[]` that transforms message state in
response to server events. Tool lifecycle updates MUST match by toolCallId rather
than by Tool name and empty result.

#### Scenario: New streaming assistant message
- **WHEN** `assistant_start` event is received
- **THEN** the reducer appends a new `UIMessage` with `role: "assistant"`,
  `isStreaming: true`, empty content and thinking

#### Scenario: Thinking delta accumulation
- **WHEN** `thinking_delta` event is received and last message is streaming
- **THEN** the reducer appends delta to the last message's `thinking` field

#### Scenario: Text delta accumulation
- **WHEN** `text_delta` event is received and last message is streaming
- **THEN** the reducer appends delta to the last message's `content` field

#### Scenario: Tool start in streaming message
- **WHEN** `tool_start` event is received and last message is streaming
- **THEN** the reducer appends a new `ToolCallEntry` with event.toolCallId and
  empty result to the last message's `tools` array

#### Scenario: Tool end updates matching entry
- **WHEN** `tool_end` event is received
- **THEN** the reducer finds the `ToolCallEntry` with matching toolCallId
- **AND** fills in result, resultDetail, and isError without changing another
  same-name Tool

#### Scenario: MCP app info attaches to tool
- **WHEN** `mcp_app` event is received with Tool identity
- **THEN** the reducer finds the matching `ToolCallEntry` by toolCallId when
  available and sets its `mcpApp`
- **AND** legacy events without toolCallId MAY fall back to toolName

#### Scenario: Assistant end finalizes message
- **WHEN** `assistant_end` event is received
- **THEN** the reducer sets `isStreaming: false` on the last message

#### Scenario: User message added
- **WHEN** `user_message` event is received
- **THEN** the reducer appends a new `UIMessage` with `role: "user"` and the
  event's text

#### Scenario: Clear conversation resets state
- **WHEN** `clear_conversation` event is received
- **THEN** the reducer returns an empty array

#### Scenario: Ready event populates initial messages
- **WHEN** `ready` event is received with `messages` array
- **THEN** the reducer maps each conversation message to a `UIMessage`,
  preserving stable Tool and Agent Activity identity

#### Scenario: User message records creation timestamp
- **WHEN** `user_message` event is received with an optional `createdAt` field
- **THEN** the reducer SHALL set `createdAt` on the resulting `UIMessage` to the
  event's `createdAt` value if present, or leave it undefined otherwise

#### Scenario: Assistant message records creation timestamp
- **WHEN** `updateLastOrCreate` creates or updates a streaming assistant message
- **THEN** the reducer SHALL set `createdAt` on the new `UIMessage` to a
  provided timestamp value if present, preserving any existing `createdAt` on
  updated messages

#### Scenario: Ready event propagates timestamps
- **WHEN** `ready` messages have an optional `createdAt` field
- **THEN** the reducer SHALL preserve each provided timestamp and leave it
  undefined when absent

### Requirement: Canonical AgentToolActivity type

共享 UI 模块 SHALL 定义纯 TypeScript `AgentToolActivity`，至少包含 toolCallId、name、
status、startedAt，并 MAY 包含 args、summary、resultDetail、endedAt 和 isError。
该类型 MUST 不依赖 Runtime、DOM 或 Node API。

#### Scenario: Running Tool Activity
- **WHEN** shared projector 接收 Tool start progress
- **THEN** `AgentToolActivity` 包含 toolCallId、name、status=running、startedAt
  和可用的 args summary

#### Scenario: Completed Tool Activity with result
- **WHEN** shared projector 接收 Tool end progress
- **THEN** 同一 `AgentToolActivity` 更新为 completed 或 failed
- **AND** 包含 endedAt、isError 和可用的 resultDetail

#### Scenario: Failed Tool Activity
- **WHEN** shared projector 接收 isError=true 的 Tool end progress
- **THEN** 同一 `AgentToolActivity` 更新为 status=failed
- **AND** resultDetail 保留可用错误文本或权威 result reference

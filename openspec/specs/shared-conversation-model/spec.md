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

### Requirement: AgentActivity 支持 Execution details

Canonical `AgentActivity` SHALL 支持可选 executionId、tools 和 permission 字段。
`tools` MUST 为 `AgentToolActivity[]`；permission MUST 至少包含 toolName 与 preview，
并 MAY 包含 toolCallId。

#### Scenario: Execution snapshot
- **WHEN** UI 接收包含 SubAgent Tool lifecycle 的 snapshot
- **THEN** AgentActivity.executionId 标识所属执行
- **AND** AgentActivity.tools 包含按开始时间稳定排序的 Tool Activity

#### Scenario: 兼容旧 Activity
- **WHEN** ready payload 中的旧 Agent Activity 不含 executionId、tools 或 permission
- **THEN** shared model 仍接受并恢复该 Activity
- **AND** consumer 将 agentId 作为 execution identity fallback

### Requirement: Agent Activity projector 合并 Tool identity

AgentActivityProjector SHALL 按 agentId/executionId 和 toolCallId 不可变地 upsert Tool
Activity，并 SHALL 在后续 state/output/exit snapshot 中保留已聚合 timeline。

#### Scenario: 首次 Tool progress
- **WHEN** Projector 收到未知 toolCallId 的 running progress
- **THEN** snapshot 新增一条 Tool Activity

#### Scenario: 后续 Tool progress
- **WHEN** Projector 收到已知 toolCallId 的 completed progress
- **THEN** snapshot 替换对应 Tool Activity
- **AND** 其他 Tool Activity 保持不变

### Requirement: Execution projection 不进入模型上下文

Execution、Tool Activity、Permission disclosure 与折叠状态 SHALL 仅存在于
display-ready UI projection。系统 MUST NOT 将其追加到 Main Agent messages。

#### Scenario: 构建下一轮 Main context
- **WHEN** 当前 TUI 展示包含 SubAgent Tool timeline 与 Permission history
- **THEN** 下一轮 Main model context 不包含这些 UI projection 字段
- **AND** 仅使用原有 Main transcript 与安全通知注入

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

### Requirement: Canonical conversation types are Presentation-owned

`UIMessage`, `ToolCallEntry`, `AgentActivity`, and `ToolResultProjection` SHALL
remain Presentation-owned types. Runtime and persistence owners SHALL expose
domain records that pure projectors convert into these types.

#### Scenario: Runtime Tool record is projected

- **WHEN** Presentation receives a runtime Tool execution record
- **THEN** a pure projector SHALL create or update `ToolCallEntry`
- **AND** Runtime SHALL remain unaware of the projected type

#### Scenario: Session is rebuilt for display

- **WHEN** Presentation receives a persisted Session snapshot
- **THEN** a projector SHALL produce canonical conversation messages
- **AND** Session persistence SHALL not embed Presentation DTOs

### Requirement: Conversation projectors are pure boundary adapters

Live-event and persisted-snapshot projectors SHALL be deterministic,
side-effect-free, and SHALL not inspect or mutate domain stores.

#### Scenario: Same execution is projected twice

- **WHEN** a projector receives identical snapshots and events
- **THEN** it SHALL return structurally equivalent canonical output

#### Scenario: Tool detail requires full text

- **WHEN** a projected Tool entry contains a stable result reference
- **THEN** Presentation SHALL resolve it through HarnessAPI
- **AND** the projector SHALL not inspect Agent or Session stores

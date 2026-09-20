## Purpose

Bidirectional WebSocket protocol — client commands, server events, streaming deltas, permission prompts.
## Requirements
### Requirement: Event types and direction
The WebSocket protocol SHALL define a clear set of event types for bidirectional communication, with client-to-server messages called "commands" and server-to-client messages called "events". The ClientCommand type SHALL include a `set_vision_delete` config action to remove the vision model configuration entirely. The `chat` command SHALL accept optional legacy `planMode: "auto" | "plan"` and SHALL treat an omitted value as autonomous routing. Standard product adapters SHALL omit the field. Base types used within commands and events SHALL be imported from the shared UI data model (`src/ui/shared/types.ts`).

#### Scenario: Standard client sends a chat command
- **WHEN** client sends `{"type":"chat","text":"Hello","images":[]}` via WebSocket
- **THEN** server processes the message as user input and Main Agent autonomously chooses direct execution or internal planning

#### Scenario: Compatibility client sends an explicit mode
- **WHEN** an older or diagnostic client includes `planMode`
- **THEN** server preserves the compatible wire behavior without requiring standard product UI to expose that control

#### Scenario: Server sends text delta events
- **WHEN** the AI model produces text output during streaming
- **THEN** server sends `{"type":"text_delta","delta":"partial text..."}` events incrementally

#### Scenario: Client sends set_vision_delete
- **WHEN** client sends `{"type":"config","action":"set_vision_delete"}` via WebSocket
- **THEN** server removes the entire vision configuration and broadcasts the updated ConfigData to all clients

### Requirement: Streaming text and thinking deltas
The protocol SHALL support separate channels for thinking/reasoning content and final text output, matching the TUI's behavior of showing thinking content in dimmed style.

#### Scenario: Thinking delta events
- **WHEN** the model produces reasoning tokens (thinking)
- **THEN** server sends `{"type":"thinking_delta","delta":"..."}` events

#### Scenario: Text delta events after thinking
- **WHEN** the model finishes thinking and starts producing final output
- **THEN** server sends `{"type":"text_delta","delta":"..."}` events

### Requirement: Tool call lifecycle events
The protocol SHALL convey tool call start and end states, including the tool name, arguments, result preview, and error status. The `ToolCallEntry` type used in `ConversationMessage` SHALL be imported from the shared module.

#### Scenario: Tool call starts
- **WHEN** the agent invokes a tool
- **THEN** server sends `{"type":"tool_start","name":"bash","args":{"command":"ls"}}`

#### Scenario: Tool call ends successfully
- **WHEN** a tool call completes without error
- **THEN** server sends `{"type":"tool_end","name":"bash","result":"file1.txt\nfile2.txt","isError":false}`

#### Scenario: Tool call ends with error
- **WHEN** a tool call fails
- **THEN** server sends `{"type":"tool_end","name":"bash","result":"command not found","isError":true}`

### Requirement: Permission prompt interaction
The protocol SHALL support interactive permission prompts: the server sends a permission request, the client responds with a decision. A SubAgent permission request SHALL include `agentId` and SHOULD include `toolCallId`; a Main Agent or legacy request MAY omit both fields.

#### Scenario: Server requests permission
- **WHEN** the agent attempts to execute a tool that requires user confirmation
- **THEN** server sends `{"type":"permission_prompt","toolName":"bash","preview":"rm -rf /tmp/test"}` and pauses execution

#### Scenario: SubAgent requests permission
- **WHEN** SubAgent `agent-123` attempts Tool Call `call-456` that requires confirmation
- **THEN** server sends a `permission_prompt` containing `agentId: "agent-123"` and `toolCallId: "call-456"`

#### Scenario: Client allows permission
- **WHEN** client responds with `{"type":"permission","decision":"allow"}`
- **THEN** server resumes tool execution

#### Scenario: Client denies permission
- **WHEN** client responds with `{"type":"permission","decision":"deny"}`
- **THEN** server blocks the tool execution and sends an info event indicating denial

#### Scenario: Client persists permission rule
- **WHEN** client responds with `{"type":"permission","decision":"always_allow","persistRule":true}`
- **THEN** server saves a persistent permission rule for the matching tool and args pattern

### Requirement: Slash command support via WebSocket
The protocol SHALL support slash commands (e.g., `/help`, `/reset`, `/config`) through the `chat` command channel. The server SHALL inspect the text of each `chat` command: if the text starts with `/` and the first word matches a known slash command, the server SHALL execute the command; otherwise the text SHALL be treated as a regular chat message to the AI. Unknown or unrecognized `/`-prefixed text SHALL be silently forwarded as chat input without an error event.

#### Scenario: Slash command execution via chat
- **WHEN** client sends `{"type":"chat","text":"/config model deepseek-v4-pro"}`
- **THEN** server recognizes the first word `config` as a known slash command, executes it, and sends result events

#### Scenario: File path sent as chat
- **WHEN** client sends `{"type":"chat","text":"/Users/foo/bar.ts"}`
- **THEN** server does not recognize `Users/foo/bar.ts` as a known slash command, and sends the text as a regular user message to the AI

#### Scenario: Unknown slash-like text forwarded to AI
- **WHEN** client sends `{"type":"chat","text":"/randomstuff"}`
- **THEN** server does not recognize `randomstuff` as a known slash command, forwards the text as a regular user message to the AI, and does NOT send an error event

#### Scenario: Slash command list for autocomplete
- **WHEN** client requests the available slash commands
- **THEN** server responds with the list of command names and descriptions

### Requirement: System message events
The protocol SHALL support info and error system messages from server to client for non-conversation notifications. Info messages SHALL include a `display` field.

#### Scenario: Info message
- **WHEN** the system has an informational message (e.g., session saved)
- **THEN** server sends `{"type":"info","text":"Session saved.","display":"toast"}`

#### Scenario: Error message
- **WHEN** the system encounters an error (e.g., invalid config)
- **THEN** server sends `{"type":"error","text":"Unknown command: /foo"}`

### Requirement: Loader state events
The protocol SHALL convey loader/spinner state so the client can show/hide loading indicators with appropriate text.

#### Scenario: Show loader
- **WHEN** the agent begins processing (model inference starts)
- **THEN** server sends `{"type":"loader","state":"show","text":"Thinking..."}`

#### Scenario: Hide loader
- **WHEN** the agent finishes processing
- **THEN** server sends `{"type":"loader","state":"hide"}`

### Requirement: Abort support
The protocol SHALL allow the client to abort an ongoing agent operation.

#### Scenario: Client aborts processing
- **WHEN** client sends `{"type":"abort"}`
- **THEN** server calls `agent.abort()` and stops streaming

### Requirement: Connection lifecycle
The protocol SHALL define a clear connection lifecycle: ready event on connect, reconnection handling, and state synchronization.

#### Scenario: Ready event on connect
- **WHEN** a WebSocket connection is established
- **THEN** server sends `{"type":"ready","model":"deepseek-v4-pro","config":{...}}` with current state

#### Scenario: Reconnection state sync
- **WHEN** a client reconnects after a disconnect
- **THEN** server sends the current conversation history and config state to restore the client's view

### Requirement: Ready event payload types
The `ready` event payload SHALL use `ConfigData` and `ConversationMessage` types imported from the shared module, ensuring the client receives the same type definitions as the server.

#### Scenario: Ready event uses shared ConfigData
- **WHEN** server sends a `ready` event
- **THEN** the `config` field matches the shared `ConfigData` type exactly

#### Scenario: Ready event uses shared ConversationMessage
- **WHEN** server sends a `ready` event with message history
- **THEN** the `messages` field is typed as `ConversationMessage[]` from the shared module

### Requirement: Session and MCP info types imported from shared module
The `SessionInfo`, `McpServerInfo`, `McpToolInfo` types used in WebSocket events SHALL be imported from the shared module rather than defined locally in `protocol.ts`. The `ClientCommand` mcp action union SHALL include `"connect"` and `"disconnect"` actions with an optional `serverName` field.

#### Scenario: Session info from shared module
- **WHEN** the `sessions` event is sent
- **THEN** the `data` field type `SessionInfo[]` references the shared `SessionInfo` type

#### Scenario: MCP state from shared module
- **WHEN** the `mcp_state` event is sent
- **THEN** the `servers` field type `McpServerInfo[]` references the shared `McpServerInfo` type

#### Scenario: MCP connect command
- **WHEN** client sends `{"type":"mcp","action":"connect","serverName":"my-server"}`
- **THEN** the command is validated against the shared `ClientCommand` type and processed by the server

### Requirement: MCP connect and disconnect actions
The WebSocket protocol SHALL support `connect` and `disconnect` actions within the `mcp` command type, allowing clients to control per-server MCP connections. The `connect` and `disconnect` actions SHALL require a `serverName` field identifying the target MCP server.

#### Scenario: Client connects an MCP server
- **WHEN** client sends `{"type":"mcp","action":"connect","serverName":"my-server"}`
- **THEN** server calls `mcpManager.connectServer("my-server")`, then broadcasts updated `mcp_state` to all clients

#### Scenario: Client disconnects an MCP server
- **WHEN** client sends `{"type":"mcp","action":"disconnect","serverName":"my-server"}`
- **THEN** server calls `mcpManager.disconnectServer("my-server")`, then broadcasts updated `mcp_state` to all clients

#### Scenario: Connect fails
- **WHEN** `mcpManager.connectServer()` throws an error
- **THEN** server broadcasts updated `mcp_state` with `"error"` status and sends an `error` event with the failure message to the requesting client

### Requirement: MCP state push on init completion
The server SHALL broadcast `mcp_state` to all connected WebSocket clients when MCP initialization completes, not only on explicit client request.

#### Scenario: Auto-push after init
- **WHEN** the harness finishes MCP initialization (connect + registerDrivers)
- **THEN** server broadcasts `{"type":"mcp_state","servers":[...]}` to all connected clients

#### Scenario: Auto-push on connection status change
- **WHEN** any MCP server's connection status changes (connect, disconnect, error)
- **THEN** server broadcasts updated `{"type":"mcp_state","servers":[...]}` to all connected clients

### Requirement: Info events carry display mode
The `info` server-to-client event SHALL include a `display` field with value `"toast"` or `"panel"`, explicitly communicating the intended presentation mode. The client SHALL use this field directly instead of inspecting the message text content.

#### Scenario: Info event with toast display
- **WHEN** the server sends a single-line informational message suitable for transient display
- **THEN** the event SHALL be `{"type":"info","text":"Session saved.","display":"toast"}`

#### Scenario: Info event with panel display
- **WHEN** the server sends a multi-line or multi-entry informational message (e.g., listing available models, drivers, slash commands)
- **THEN** the event SHALL be `{"type":"info","text":"Available models:\n- gpt-4o\n- claude-3-opus","display":"panel"}`

#### Scenario: Client routes by display field
- **WHEN** the Web frontend receives an `info` event
- **THEN** it SHALL check `event.display` to decide rendering: `"panel"` → CommandPanel, `"toast"` → Toast
- **AND** SHALL NOT inspect `event.text` content (no `includes("\n")`, `startsWith("Available")`, etc.)

### Requirement: Session list event includes processing state
The `sessions` server-to-client event SHALL include an optional `isProcessing: boolean` field indicating whether the agent is currently processing a turn. The `currentSessionId` field SHALL accurately reflect the current session identifier managed by `SessionManager`, and SHALL be sent every time the `sessions` event is emitted.

#### Scenario: sessions event with processing true
- **WHEN** the server emits a `sessions` event and the agent is currently processing a turn
- **THEN** the event SHALL include `isProcessing: true`

#### Scenario: sessions event with processing false
- **WHEN** the server emits a `sessions` event and the agent is not processing
- **THEN** the event SHALL include `isProcessing: false`

#### Scenario: currentSessionId always present
- **WHEN** the server emits a `sessions` event after any session state change (list, save, load, delete)
- **THEN** the event SHALL include `currentSessionId` reflecting the active session ID from `SessionManager`, or `undefined` if no session is active

### Requirement: sessions event carries pending permission state
The `sessions` server event SHALL include an optional `pendingPermission` field in each `SessionInfo` object. When a session has a pending tool permission that was interrupted by a session switch, this field SHALL contain `{ toolName: string; preview: string; fuzzyPattern?: string | null }`. When no permission is pending, the field SHALL be `undefined` or absent.

#### Scenario: Pending permission is projected in the Session list

- **WHEN** a Session has an interrupted pending tool permission
- **THEN** its `SessionInfo` SHALL include the structured `pendingPermission` summary
- **AND** a Session without a pending permission SHALL omit the field

### Requirement: WebSocket server sources events from HarnessEventBus

The WebSocket server (or WebUiBackend acting as server) SHALL subscribe to `HarnessEventBus` and relay events to connected clients. The existing WebSocket message types (`text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `info`, `error`, `loader`, `mcp_state`, `config`, `sessions`) SHALL be derived from the corresponding `HarnessEventBus` events rather than emitted from scattered `broadcast()` calls.

#### Scenario: text_delta from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "llm:text:delta", delta: "Hello" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "text_delta", delta: "Hello" }` to all connected clients

#### Scenario: thinking_delta from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "llm:thinking:delta", delta: "..." }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "thinking_delta", delta: "..." }` to all connected clients

#### Scenario: tool_start from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "tool:start", name: "bash", args: {...} }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "tool_start", name: "bash", args: {...} }` to all connected clients

#### Scenario: tool_end from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "tool:end", name: "bash", result: "...", isError: false }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "tool_end", name: "bash", result: "...", isError: false }` to all connected clients

#### Scenario: info from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "ui:info", text: "Saved.", display: "toast" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "info", text: "Saved.", display: "toast" }` to all connected clients

#### Scenario: error from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "ui:error", text: "Failed." }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "error", text: "Failed." }` to all connected clients

#### Scenario: loader show/hide from processing events

- **WHEN** `HarnessEventBus` emits `{ type: "processing:start" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "loader", state: "show" }` to all connected clients
- **WHEN** `HarnessEventBus` emits `{ type: "processing:stop" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "loader", state: "hide" }` to all connected clients

#### Scenario: mcp_state from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "mcp:state", servers: [...] }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "mcp_state", servers: [...] }` to all connected clients

#### Scenario: config from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "config:change", data: {...} }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "config", data: {...} }` to all connected clients

### Requirement: WebSocket protocol message contract unchanged

Existing wire message variants SHALL remain backward compatible. Clients continue to receive `text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `info`, `error`, `loader`, `mcp_state`, `config`, and `sessions` messages with identical payload shapes. The additive Plan command and event variants defined by this change do not alter those existing payloads.

#### Scenario: Client receives identical text_delta

- **WHEN** the AI generates text output during streaming
- **THEN** the client SHALL receive `{ "type": "text_delta", "delta": "..." }` with the same structure as before the event bus migration

#### Scenario: Client receives identical tool_start

- **WHEN** the agent invokes a tool
- **THEN** the client SHALL receive `{ "type": "tool_start", "name": "...", "args": {...} }` with the same structure as before

#### Scenario: sessions event with pending permission
- **WHEN** the server sends a `sessions` event and the current session has `pendingPermission` in its metadata
- **THEN** the event's `data` array SHALL include that session's `SessionInfo` with `pendingPermission: { toolName: "...", preview: "...", fuzzyPattern: "..." }`

#### Scenario: sessions event without pending permission
- **WHEN** the server sends a `sessions` event and no session has `pendingPermission`
- **THEN** each `SessionInfo` in `data` SHALL have `pendingPermission` as `undefined` or the field absent

#### Scenario: pendingPermission removed after resolution
- **WHEN** the user resolves the pending permission (allow or deny) and the server re-saves the session
- **THEN** subsequent `sessions` events SHALL NOT include `pendingPermission` for that session

#### Scenario: Plan variants are added
- **WHEN** a Plan-capable client connects
- **THEN** it can use the additive Plan variants without changing the payload contract of any pre-existing variant

### Requirement: Context window event
The WebSocket protocol SHALL include a `context_window` server-to-client event type that carries token usage breakdown data.

#### Scenario: Server sends context_window after turn end
- **WHEN** the agent completes a turn (`assistant_end`)
- **THEN** the server SHALL broadcast a `context_window` event with the updated token breakdown

#### Scenario: Server sends context_window on connect
- **WHEN** a WebSocket connection is established and the `ready` event is sent
- **THEN** the server SHALL also send a `context_window` event with the current token breakdown

#### Scenario: Server sends context_window after clear
- **WHEN** the conversation is cleared via `/reset`
- **THEN** the server SHALL broadcast a `context_window` event with used=0

#### Scenario: Context window event payload structure
- **WHEN** the server sends a `context_window` event
- **THEN** the payload SHALL include: `type: "context_window"`, `total: number` (context window size), `used: number` (total tokens used), `free: number` (available tokens), `categories: { system: number, user: number, thinking: number, fileRead: number, fileEdit: number, terminal: number, browser: number, other: number }`

### Requirement: Context window event throttling
The server SHALL throttle `context_window` event broadcasts to at most once per 500ms during active streaming (between `assistant_start` and `assistant_end`). The event at `assistant_end` SHALL always be sent regardless of throttle window.

#### Scenario: Throttling during tool calls
- **WHEN** multiple tool calls complete within a 500ms window during a streaming turn
- **THEN** only the first `context_window` event is sent immediately; subsequent ones are coalesced and sent at most 500ms after the last one

#### Scenario: No throttle at turn end
- **WHEN** `assistant_end` fires and the last `context_window` was sent 100ms ago
- **THEN** the `context_window` event SHALL still be sent immediately (throttle bypassed at turn end)
-e 

---

### Requirement: Artifact streaming events
The ServerEvent type SHALL include `artifact_start`, `artifact_delta` (with a `delta: string` field), and `artifact_end` event types for streaming LLM-generated HTML content to the client.

#### Scenario: artifact_start event
- **WHEN** the server initiates artifact generation
- **THEN** it sends `{ "type": "artifact_start" }`

#### Scenario: artifact_delta event
- **WHEN** the LLM produces a chunk of HTML during artifact generation
- **THEN** it sends `{ "type": "artifact_delta", "delta": "<div class=\"chart\">" }`

#### Scenario: artifact_end event
- **WHEN** the LLM completes artifact generation
- **THEN** it sends `{ "type": "artifact_end" }`

### Requirement: Artifact client command
The ClientCommand type SHALL include an `artifact` command with fields: `action: "generate" | "update"`, optional `context: string` (for generate), and optional `instruction: string` (for update).

#### Scenario: artifact generate command
- **WHEN** the client sends `{ "type": "artifact", "action": "generate", "context": "session_dashboard" }`
- **THEN** the server processes it as an artifact generation request

#### Scenario: artifact update command
- **WHEN** the client sends `{ "type": "artifact", "action": "update", "instruction": "make the charts bigger" }`
- **THEN** the server processes it as an artifact modification request

### Requirement: Chat command accepts optional fileRefs field
The `ClientCommand` for `chat` type SHALL accept an optional `fileRefs: string[]` field carrying absolute file paths attached to the message, separate from the `text` field.

#### Scenario: Chat with fileRefs
- **WHEN** client sends `{"type":"chat","text":"review the code","fileRefs":["/Users/x/project/src/app.ts","/Users/x/Downloads/report.pdf"]}`
- **THEN** server SHALL accept the command
- **AND** server SHALL resolve the fileRefs using `resolveFileRefs()`
- **AND** the resolved content SHALL be included in the message sent to the agent

#### Scenario: Chat without fileRefs
- **WHEN** client sends `{"type":"chat","text":"hello"}`
- **THEN** server SHALL process the message identically to before this change
- **AND** `fileRefs` SHALL default to an empty array

#### Scenario: Backward compatibility
- **WHEN** an old client sends `{"type":"chat","text":"review @src/app.ts"}` without `fileRefs`
- **THEN** server SHALL still resolve any `@path` references in the text field via `resolveAtFileRefs()` (existing behavior preserved)

### Requirement: Typed Eval Dashboard lifecycle event

The shared `ServerEvent` protocol SHALL define an `eval_dashboard` event whose payload is a discriminated union over `status: "starting" | "running" | "completed" | "failed"`. A starting event SHALL carry the optional requested Session ID because canonical target/run identity may not yet exist. Running/completed/failed events associated with a created run SHALL carry canonical `targetSessionId` and `runId`.

Running events SHALL carry CHIEF stage, stage index/total, Application and optional worker Agent ID. Completed events SHALL carry the complete self-contained HTML and generation timestamp. Failed events SHALL carry an escaped error summary and optional failed stage.

#### Scenario: Starting Eval event

- **WHEN** the WebUI slash-command handler recognizes `/eval` or `/eval <session-id>`
- **THEN** the server SHALL send `{ type: "eval_dashboard", status: "starting", requestedSessionId? }`
- **AND** SHALL send it before awaiting Session loading or CHIEF execution
- **AND** the payload SHALL NOT invent `targetSessionId` or `runId`

#### Scenario: Running Eval event

- **WHEN** the CHIEF backtrack stage starts with a worker Agent
- **THEN** the server SHALL send an event equivalent to `{ type: "eval_dashboard", status: "running", targetSessionId, runId, stage: "backtrack", index: 4, total: 7, application: "chief-backtrack", workerAgentId }`

#### Scenario: Completed Eval event

- **WHEN** the coordinator has atomically written and validated the completed Dashboard
- **THEN** the server SHALL send `{ type: "eval_dashboard", status: "completed", targetSessionId, runId, html, generatedAt }`
- **AND** `html` SHALL be the exact generated self-contained report

#### Scenario: Failed Eval event

- **WHEN** a required CHIEF stage fails after retry
- **THEN** the server SHALL send `{ type: "eval_dashboard", status: "failed", targetSessionId, runId, stage, error }`
- **AND** SHALL NOT include partial HTML as a completed report

### Requirement: Eval Dashboard events are server-authoritative

The client SHALL NOT provide filesystem paths or arbitrary HTML through an Eval Dashboard command. Eval Dashboard events SHALL only originate from the server-side `/eval` coordinator for a run it created.

#### Scenario: Client cannot request arbitrary Eval path

- **WHEN** a client sends a payload containing a local file path while attempting to open an Eval report
- **THEN** the protocol SHALL NOT interpret that path as an Eval Dashboard source
- **AND** the backend SHALL NOT read or serve the requested arbitrary path

#### Scenario: External open uses received HTML

- **WHEN** WebUI opens a completed Eval report outside the embedded view
- **THEN** it SHALL use the HTML already received in the completed event
- **AND** no additional server filesystem command SHALL be required

### Requirement: WebSocket defines typed Plan client commands
`ClientCommand` SHALL continue to accept an optional `planMode` field for protocol compatibility, but standard Web/TUI Chat adapters SHALL omit it and rely on autonomous routing. The protocol SHALL define `plan_decision`, `plan_approve`, `plan_replan`, and `plan_cancel` variants for typed interaction and internal lifecycle control. Every Plan mutation command SHALL identify the selected Session that owns the active Plan. Typed alignment responses and internal approvals MUST NOT be encoded as ordinary chat text.

#### Scenario: Client answers a Chat-native alignment
- **WHEN** the client sends `plan_decision`
- **THEN** the command carries planId, expectedVersion, commandId, interactionId, and the selected or custom user-value constraint

#### Scenario: Client transport rejects an alignment command
- **WHEN** the WebSocket is not open and cannot write `plan_decision`
- **THEN** the client reports the send as unsuccessful and retains the pending interaction for a later retry with the same command identity

#### Scenario: Client approves execution
- **WHEN** an internal or compatibility adapter sends `plan_approve`
- **THEN** the command carries planId, expectedVersion, commandId, interactionId, semantic revision, digest, and acknowledged side-effect categories

#### Scenario: Client requests replanning
- **WHEN** the client sends `plan_replan`
- **THEN** the command carries planId, expectedVersion, commandId, and a public reason

#### Scenario: Delayed command follows a Session switch
- **WHEN** a Plan command identifies a Session that is no longer selected or a Plan that is no longer active for that Session
- **THEN** the server rejects the mutation and returns the authoritative Plan state for the currently selected Session

### Requirement: WebSocket defines typed Plan server events
`ServerEvent` SHALL define `plan_state`, `plan_interaction`, `plan_ready`, and `plan_conflict` variants.

#### Scenario: Plan changes
- **WHEN** the backend receives a committed `plan:updated` domain event
- **THEN** it sends `plan_state` containing the authoritative immutable snapshot

#### Scenario: Intent alignment is pending
- **WHEN** the backend receives `plan:interaction`
- **THEN** it sends `plan_interaction` with typed Chat-native user-value alignment content

#### Scenario: Plan is authorized for execution
- **WHEN** a committed Plan has an approval and executable items
- **THEN** the server sends the authoritative `plan_state` and one stable `plan_ready` label before scheduling Main execution continuation, allowing clients to derive the global Plan output without a second model summary or a new wire variant

#### Scenario: Plan is replanned
- **WHEN** a new semantic revision is still drafting or awaiting internal authorization
- **THEN** the server does not publish it as the global Plan output; after authorization it publishes the new snapshot and updated stable label as one replacement projection

#### Scenario: Client version is stale
- **WHEN** a command fails PlanStore CAS validation
- **THEN** the server sends `plan_conflict` containing the current version, semantic revision, and snapshot

### Requirement: WebSocket restores Plan projection on connection changes
The server SHALL synchronize active Plan state after connection, Session selection, and backend recovery.

#### Scenario: Client connects with an active Plan
- **WHEN** the initial `ready` exchange completes
- **THEN** the server sends `plan_state`, any authorized `plan_ready`, and any pending `plan_interaction`; clients restore the global Plan output collapsed by default from the authorized snapshot

#### Scenario: Client switches Session
- **WHEN** the selected Session changes
- **THEN** the server clears the old Plan projection and sends the active Plan state for the new Session

#### Scenario: Client restores a terminal Plan
- **WHEN** the selected Session owns a cancelled or failed Plan whose execution authorization has been cleared
- **THEN** the server sends the terminal `plan_state` whose authorization history lets the client reconstruct the last authorized public Plan, while terminal TODO state arrives separately through `task_state`

#### Scenario: No active Plan exists
- **WHEN** the selected Session has no active Plan
- **THEN** the server sends `plan_state` with an explicit empty value

### Requirement: WebSocket synchronizes TaskState independently
`ServerEvent` SHALL define a `task_state` variant containing the selected
Session identity and an immutable TaskState snapshot or explicit empty value.
The event MUST NOT contain PlanExecutionStep state, verification evidence, Tool
history, continuation counters, hidden prompts, or private reasoning. Standard
Web and TUI clients SHALL consume TaskState as read-only state and SHALL NOT
define a presentation command that mutates TODO.

#### Scenario: TaskState changes
- **WHEN** the backend receives a committed `task:updated` domain event for the selected Session
- **THEN** it sends `task_state` containing the authoritative TaskState snapshot

#### Scenario: Client connects with current task state
- **WHEN** the initial `ready` exchange completes
- **THEN** the server sends `task_state` independently of any `plan_state`, allowing Direct requests to restore TODO without a Plan

#### Scenario: Client switches Session
- **WHEN** the selected Session changes
- **THEN** the server clears the old TaskState projection and sends the target Session's TaskState or an explicit empty value

#### Scenario: Plan and task events arrive in either order
- **WHEN** a client receives `plan_state` and `task_state` in any order
- **THEN** it updates separate reducer slices and renders Plan before TODO without deriving one snapshot from the other

#### Scenario: Terminal task is restored
- **WHEN** the owning Main Agent retains a completed, cancelled, failed, or externally blocked TaskState
- **THEN** the server sends that TaskState directly instead of reconstructing terminal TODO statuses from Plan history

### Requirement: Plan commands are idempotent and conflict-aware
The server SHALL deduplicate Plan commands by commandId plus payload digest, SHALL allow one successful command to consume a pending interactionId, and SHALL NOT automatically retry stale approvals against a newer version or semantic revision.

#### Scenario: Duplicate command is received
- **WHEN** a previously applied commandId is received again with the same payload digest
- **THEN** the server returns the stored receipt result or current Plan snapshot without applying a second transition

#### Scenario: Command ID payload differs
- **WHEN** a previously seen commandId is received with a different payload digest
- **THEN** the server rejects the command as invalid without mutating the Plan

#### Scenario: Interaction is consumed twice
- **WHEN** a new commandId attempts to resolve an already consumed interactionId
- **THEN** the server rejects the command and returns the receipt for the successful resolution

#### Scenario: Internal authorization races with replanning
- **WHEN** `plan_approve` references the revision that preceded a replan
- **THEN** the server rejects authorization, sends `plan_conflict`, and requires Planner to validate the new revision before execution

#### Scenario: Conflict snapshot retains a pending interaction
- **WHEN** the authoritative conflict snapshot still contains the visible pending interaction
- **THEN** the client keeps or restores that Chat alignment so the user can answer against the current revision

#### Scenario: Conflict result has no domain event
- **WHEN** HarnessAPI returns a typed conflict without publishing a corresponding domain conflict event
- **THEN** the server sends one authoritative `plan_conflict` to the requesting client and does not duplicate an already projected domain event

### Requirement: WebSocket protocol carries authoritative episode state
The server SHALL serialize execution episode snapshots and impasse events from
HarnessEventBus to WebSocket clients. Clients MUST NOT derive episode phase from
streaming silence, processing timers, connection state, or local Tool counts.

#### Scenario: Episode transitions to reflection
- **WHEN** HarnessEventBus emits a reflecting episode snapshot
- **THEN** connected clients receive the typed snapshot with the same episode and Plan identities

#### Scenario: Client reconnects to a paused Session
- **WHEN** a client reconnects after an episode became `paused_inconclusive`
- **THEN** the ready or Session synchronization payload includes the persisted paused snapshot

#### Scenario: Legacy Session has no episode
- **WHEN** a Session predates episode state or did not execute an approved Plan
- **THEN** synchronization omits the optional snapshot without failing the connection

### Requirement: WebSocket protocol accepts explicit episode recovery commands
The protocol SHALL accept typed adjust-plan and continue-execution commands carrying
command ID, Plan identity, expected version, revision, and digest. The server SHALL
return typed success receipts or conflicts and MUST NOT resume execution merely
because a client reconnects.

#### Scenario: User continues from Web
- **WHEN** the client sends a valid continue-execution command for a paused episode
- **THEN** the server delegates to HarnessAPI and broadcasts the resulting running snapshot

#### Scenario: Duplicate command is redelivered
- **WHEN** transport retry sends the same command ID and payload again
- **THEN** the server returns the original receipt without creating another episode

#### Scenario: Stale command is sent
- **WHEN** the command does not match the current Plan version, revision, or digest
- **THEN** the server returns a typed conflict with the current episode snapshot

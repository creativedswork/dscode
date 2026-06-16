## Purpose

Bidirectional WebSocket protocol — client commands, server events, streaming deltas, permission prompts.
## Requirements
### Requirement: Event types and direction
The WebSocket protocol SHALL define a clear set of event types for bidirectional communication, with client-to-server messages called "commands" and server-to-client messages called "events". The ClientCommand type SHALL include a `set_vision_delete` config action to remove the vision model configuration entirely. Base types used within commands and events SHALL be imported from the shared UI data model (`src/ui/shared/types.ts`).

#### Scenario: Client sends a chat command
- **WHEN** client sends `{"type":"chat","text":"Hello","images":[]}` via WebSocket
- **THEN** server processes the message as a user input and begins streaming the assistant response

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
The protocol SHALL support interactive permission prompts: the server sends a permission request, the client responds with a decision.

#### Scenario: Server requests permission
- **WHEN** the agent attempts to execute a tool that requires user confirmation
- **THEN** server sends `{"type":"permission_prompt","toolName":"bash","preview":"rm -rf /tmp/test"}` and pauses execution

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

#### Scenario: sessions event with pending permission
- **WHEN** the server sends a `sessions` event and the current session has `pendingPermission` in its metadata
- **THEN** the event's `data` array SHALL include that session's `SessionInfo` with `pendingPermission: { toolName: "...", preview: "...", fuzzyPattern: "..." }`

#### Scenario: sessions event without pending permission
- **WHEN** the server sends a `sessions` event and no session has `pendingPermission`
- **THEN** each `SessionInfo` in `data` SHALL have `pendingPermission` as `undefined` or the field absent

#### Scenario: pendingPermission removed after resolution
- **WHEN** the user resolves the pending permission (allow or deny) and the server re-saves the session
- **THEN** subsequent `sessions` events SHALL NOT include `pendingPermission` for that session

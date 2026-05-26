## ADDED Requirements

### Requirement: Event types and direction
The WebSocket protocol SHALL define a clear set of event types for bidirectional communication, with client-to-server messages called "commands" and server-to-client messages called "events".

#### Scenario: Client sends a chat command
- **WHEN** client sends `{"type":"chat","text":"Hello","images":[]}` via WebSocket
- **THEN** server processes the message as a user input and begins streaming the assistant response

#### Scenario: Server sends text delta events
- **WHEN** the AI model produces text output during streaming
- **THEN** server sends `{"type":"text_delta","delta":"partial text..."}` events incrementally

### Requirement: Streaming text and thinking deltas
The protocol SHALL support separate channels for thinking/reasoning content and final text output, matching the TUI's behavior of showing thinking content in dimmed style.

#### Scenario: Thinking delta events
- **WHEN** the model produces reasoning tokens (thinking)
- **THEN** server sends `{"type":"thinking_delta","delta":"..."}` events

#### Scenario: Text delta events after thinking
- **WHEN** the model finishes thinking and starts producing final output
- **THEN** server sends `{"type":"text_delta","delta":"..."}` events

### Requirement: Tool call lifecycle events
The protocol SHALL convey tool call start and end states, including the tool name, arguments, result preview, and error status.

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
The protocol SHALL allow clients to invoke slash commands (e.g., `/help`, `/reset`, `/config`) through WebSocket messages.

#### Scenario: Slash command execution
- **WHEN** client sends `{"type":"slash","command":"/config model deepseek-v4-pro"}`
- **THEN** server executes the corresponding slash command and sends result events

#### Scenario: Slash command list for autocomplete
- **WHEN** client requests the available slash commands
- **THEN** server responds with the list of command names and descriptions

### Requirement: System message events
The protocol SHALL support info and error system messages from server to client for non-conversation notifications.

#### Scenario: Info message
- **WHEN** the system has an informational message (e.g., session saved)
- **THEN** server sends `{"type":"info","text":"Session saved."}`

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

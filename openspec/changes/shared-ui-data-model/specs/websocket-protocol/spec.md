## MODIFIED Requirements

### Requirement: Event types and direction
The WebSocket protocol SHALL define a clear set of event types for bidirectional communication, with client-to-server messages called "commands" and server-to-client messages called "events". Base types used within commands and events SHALL be imported from the shared UI data model (`src/ui/shared/types.ts`).

#### Scenario: Client sends a chat command
- **WHEN** client sends `{"type":"chat","text":"Hello","images":[]}` via WebSocket
- **THEN** server processes the message as a user input and begins streaming the assistant response

#### Scenario: Server sends text delta events
- **WHEN** the AI model produces text output during streaming
- **THEN** server sends `{"type":"text_delta","delta":"partial text..."}` events incrementally

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

### Requirement: Ready event payload types
The `ready` event payload SHALL use `ConfigData` and `ConversationMessage` types imported from the shared module, ensuring the client receives the same type definitions as the server.

#### Scenario: Ready event uses shared ConfigData
- **WHEN** server sends a `ready` event
- **THEN** the `config` field matches the shared `ConfigData` type exactly

#### Scenario: Ready event uses shared ConversationMessage
- **WHEN** server sends a `ready` event with message history
- **THEN** the `messages` field is typed as `ConversationMessage[]` from the shared module

### Requirement: Session and MCP info types imported from shared module
The `SessionInfo`, `McpServerInfo`, `McpToolInfo` types used in WebSocket events SHALL be imported from the shared module rather than defined locally in `protocol.ts`.

#### Scenario: Session info from shared module
- **WHEN** the `sessions` event is sent
- **THEN** the `data` field type `SessionInfo[]` references the shared `SessionInfo` type

#### Scenario: MCP state from shared module
- **WHEN** the `mcp_state` event is sent
- **THEN** the `servers` field type `McpServerInfo[]` references the shared `McpServerInfo` type

## ADDED Requirements

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

## MODIFIED Requirements

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

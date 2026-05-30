## ADDED Requirements

### Requirement: MCP state push after initialization
The Web UI backend SHALL broadcast the current MCP server states to all connected WebSocket clients immediately after MCP initialization and driver registration completes, so the sidebar reflects actual connection status without requiring manual refresh.

#### Scenario: MCP state pushed after init
- **WHEN** `harness.run()` completes MCP initialization (`mcpManager.initialize()` + `mcpManager.registerDrivers()`)
- **THEN** the Web UI backend broadcasts `{"type":"mcp_state","servers":[...]}` to all connected WebSocket clients with current `McpServerInfo[]`

#### Scenario: No MCP configured
- **WHEN** `config.mcp` is empty
- **THEN** no `mcp_state` event is broadcast during initialization

### Requirement: MCP state push to new connections
When a new WebSocket client connects and MCP is already initialized, the server SHALL push the current MCP state.

#### Scenario: New client receives MCP state
- **WHEN** a WebSocket client connects and `mcpManager` is already initialized
- **THEN** the server sends `{"type":"mcp_state","servers":[...]}` immediately after the `ready` event

#### Scenario: New client before MCP init
- **WHEN** a WebSocket client connects before MCP initialization is complete
- **THEN** the client does NOT receive `mcp_state` during connect; it receives `mcp_state` when MCP initialization completes

### Requirement: MCP state push on connection status change
When any MCP server's connection status changes (connected, disconnected, error), the Web UI backend SHALL broadcast the updated MCP state to all connected WebSocket clients.

#### Scenario: Server connects
- **WHEN** a user triggers per-server connect and the server successfully connects
- **THEN** the Web UI backend broadcasts updated `mcp_state` with the new `"connected"` status

#### Scenario: Server disconnects
- **WHEN** a user triggers per-server disconnect and the server closes
- **THEN** the Web UI backend broadcasts updated `mcp_state` with the new `"disconnected"` status

#### Scenario: Server connection fails
- **WHEN** a per-server connect attempt fails
- **THEN** the Web UI backend broadcasts updated `mcp_state` with `"error"` status and the error message

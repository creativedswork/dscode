## ADDED Requirements

### Requirement: Refresh reconnects dead MCP servers
When `MCPManager.registerDrivers()` fails to list tools from an existing client whose state is `"connected"` or `"error"`, the system SHALL attempt one reconnection before reporting failure. The system SHALL NOT reconnect servers whose state is `"disconnected"`.

#### Scenario: Refresh successfully reconnects after server restart
- **WHEN** `registerDrivers()` calls `listTools()` on an existing MCP client and it fails with a connection error
- **AND** the server's state is `"connected"` or `"error"`
- **THEN** the system closes the old MCP client, creates a new one, calls `connect()`, calls `listTools()`, and registers the tools via `registerDriver()`
- **AND** the server's state is updated to `"connected"` with the new tool count

#### Scenario: Refresh reconnection fails
- **WHEN** the reconnection attempt (connect + listTools) also fails
- **THEN** the server's state is set to `"error"` with the error message from the reconnection attempt
- **AND** the old dead client is cleaned up (removed from internal map)

#### Scenario: Refresh on disconnected server does not reconnect
- **WHEN** `registerDrivers()` encounters a server whose status is `"disconnected"`
- **THEN** no reconnection attempt is made and the server remains disconnected

#### Scenario: Refresh on healthy server proceeds normally
- **WHEN** `registerDrivers()` calls `listTools()` on an existing MCP client and it succeeds
- **THEN** the system registers the tools normally without any reconnection logic

### Requirement: Connect action allows reconnection from error state
When `connectServer()` is called for a server that has a stale client in its internal map but whose status is `"error"`, the system SHALL close the stale client and proceed with a fresh connection.

#### Scenario: Connect on server in error state reconnects
- **WHEN** `connectServer()` is called for a server with an existing client
- **AND** the server's state status is `"error"`
- **THEN** the system closes the old client, removes it from the map, creates a new client, and connects

#### Scenario: Connect on disconnected server still skips
- **WHEN** `connectServer()` is called for a server with an existing client
- **AND** the server's state status is `"disconnected"`
- **THEN** the system returns without action (preserving existing behavior)

### Requirement: Reconnection is asynchronous and non-blocking
The reconnection logic SHALL execute asynchronously without blocking the caller's event loop. Both WebSocket message handling and TUI rendering SHALL remain responsive during reconnection.

#### Scenario: Web UI remains responsive during reconnect
- **WHEN** a WebSocket `mcp` refresh message triggers `registerDrivers()` which initiates a reconnection
- **THEN** the WebSocket message handler returns immediately without awaiting the reconnection result
- **AND** the updated MCP state is pushed to clients only after reconnection completes (success or failure)

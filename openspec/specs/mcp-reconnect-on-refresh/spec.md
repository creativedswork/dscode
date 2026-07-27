## Purpose

Ensures MCP servers automatically reconnect during refresh (e.g. server restart), allowing dead connections to recover without manual intervention.
## Requirements
### Requirement: Refresh reconnects dead MCP servers
When `MCPManager.registerDrivers()` fails to list tools from an existing client whose state is `"connected"` or `"error"`, the system SHALL schedule a reconnection using `scheduleReconnect()` with exponential backoff. The system SHALL NOT reconnect servers whose state is `"disconnected"`.

#### Scenario: Refresh successfully reconnects after server restart
- **WHEN** `registerDrivers()` calls `listTools()` on an existing MCP client and it fails with a connection error
- **AND** the server's state is `"connected"` or `"error"`
- **THEN** the system closes the old MCP client, unregisters the stale driver, then calls `scheduleReconnect(name, 0)` to initiate the reconnect loop
- **AND** on successful reconnect, the server's state is updated to `"connected"` with the new tool count

#### Scenario: Refresh reconnection uses backoff on failure
- **WHEN** the `scheduleReconnect` attempt initiated by `registerDrivers()` fails with a transient error
- **AND** the attempt count is less than 10
- **THEN** the next reconnect attempt is scheduled with exponential backoff delay (`min(30000, 1000 * 2^attempt) + jitter` ms)
- **AND** the server state remains `"reconnecting"` during the backoff period

#### Scenario: Refresh reconnection exhausts retries
- **WHEN** all reconnect attempts are exhausted (10 failures)
- **THEN** the server's state is set to `"error"` with the last error message
- **AND** no further reconnect attempts are scheduled

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

#### Scenario: Automatic reconnect is non-blocking
- **WHEN** a `"disconnected"` event triggers `scheduleReconnect()`
- **THEN** the event handler returns immediately without awaiting the reconnection result
- **AND** all subsequent reconnect attempts are scheduled via `setTimeout`, never blocking the event loop


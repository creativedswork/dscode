## MODIFIED Requirements

### Requirement: MCP state push on connection status change
When any MCP server's connection status changes (connected, disconnected, error) — including status changes resulting from reconnection during refresh — the Web UI backend SHALL broadcast the updated MCP state to all connected WebSocket clients.

#### Scenario: Server connects
- **WHEN** a user triggers per-server connect and the server successfully connects
- **THEN** the Web UI backend broadcasts updated `mcp_state` with the new `"connected"` status

#### Scenario: Server disconnects
- **WHEN** a user triggers per-server disconnect and the server closes
- **THEN** the Web UI backend broadcasts updated `mcp_state` with the new `"disconnected"` status

#### Scenario: Server connection fails
- **WHEN** a per-server connect attempt fails
- **THEN** the Web UI backend broadcasts updated `mcp_state` with `"error"` status and the error message

#### Scenario: Refresh reconnection succeeds
- **WHEN** a user triggers refresh and `registerDrivers()` successfully reconnects a previously-failed server
- **THEN** the Web UI backend broadcasts updated `mcp_state` with the server's new `"connected"` status and updated tool count

#### Scenario: Refresh reconnection fails
- **WHEN** a user triggers refresh and `registerDrivers()` fails to reconnect a dead server
- **THEN** the Web UI backend broadcasts updated `mcp_state` with the server's `"error"` status and the error message

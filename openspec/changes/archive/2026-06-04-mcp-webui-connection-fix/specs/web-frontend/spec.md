## MODIFIED Requirements

### Requirement: MCP browser panel
The frontend SHALL provide a panel to browse connected MCP servers and their tools using warm flat styling. Each server entry SHALL display a Connect or Disconnect button depending on its current connection status, allowing users to control per-server MCP connections without leaving the sidebar.

#### Scenario: Server list display
- **WHEN** user opens the MCP browser panel
- **THEN** all configured MCP servers are listed with flat warm-toned cards and muted pastel status indicators

#### Scenario: Tool list for a server
- **WHEN** user clicks on an MCP server
- **THEN** the tools provided by that server are displayed in monospace with warm muted styling

#### Scenario: Connect button for disconnected server
- **WHEN** an MCP server has status `"disconnected"` or `"error"`
- **THEN** a "Connect" button is displayed next to the server entry, and clicking it sends `{"type":"mcp","action":"connect","serverName":"<name>"}`

#### Scenario: Disconnect button for connected server
- **WHEN** an MCP server has status `"connected"` or `"connecting"`
- **THEN** a "Disconnect" button is displayed next to the server entry, and clicking it sends `{"type":"mcp","action":"disconnect","serverName":"<name>"}`

#### Scenario: Refresh button
- **WHEN** the user clicks the global Refresh button
- **THEN** server refreshes all MCP tool lists and pushes updated `mcp_state`

#### Scenario: State auto-update
- **WHEN** the server pushes `mcp_state` unsolicited (after init, connect, or disconnect)
- **THEN** the MCP panel updates its displayed server states without user action

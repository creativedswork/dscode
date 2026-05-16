## ADDED Requirements

### Requirement: dscode SHALL declare MCP Apps UI capability during MCP initialize
When connecting to an MCP server, dscode's MCPClient SHALL include the `io.modelcontextprotocol/ui` extension in its capabilities with `mimeTypes: ["text/html;profile=mcp-app"]`.

#### Scenario: Client declares ui capability on connection
- **WHEN** MCPClient.connect() sends the initialize request
- **THEN** the request params SHALL include `capabilities.extensions["io.modelcontextprotocol/ui"]` with `mimeTypes` containing `"text/html;profile=mcp-app"`

#### Scenario: Server responds with ui-enabled tools
- **WHEN** a connected MCP server supports MCP Apps and has tools with `_meta.ui.resourceUri`
- **THEN** `tools/list` SHALL return those tools with complete `_meta.ui` metadata

#### Scenario: Graceful degradation when server does not support ui
- **WHEN** a connected MCP server does not support MCP Apps
- **THEN** `tools/list` SHALL return tools without `_meta.ui` metadata and dscode SHALL work normally

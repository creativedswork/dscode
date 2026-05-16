## ADDED Requirements

### Requirement: Tools with visibility ["app"] SHALL NOT be exposed to the LLM
When MCPManager registers tools from a connected server, any tool whose `_meta.ui.visibility` is `["app"]` (app-only) SHALL be excluded from the LLM's tool list. The default visibility when omitted is `["model", "app"]`, which SHALL be treated as visible to the model.

#### Scenario: App-only tool is hidden from model
- **WHEN** an MCP server registers a tool with `_meta.ui.visibility: ["app"]`
- **THEN** `ToolRegistry.buildToolsForRequest()` SHALL NOT include that tool

#### Scenario: Default visibility exposes tool to model
- **WHEN** an MCP server registers a tool with `_meta.ui.resourceUri` but no `_meta.ui.visibility`
- **THEN** `ToolRegistry.buildToolsForRequest()` SHALL include that tool (defaults to visible to model)

#### Scenario: Model-and-app tool is exposed to model
- **WHEN** an MCP server registers a tool with `_meta.ui.visibility: ["model", "app"]`
- **THEN** `ToolRegistry.buildToolsForRequest()` SHALL include that tool

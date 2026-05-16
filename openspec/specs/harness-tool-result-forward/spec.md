## ADDED Requirements

### Requirement: Harness SHALL forward tool execution results to registered MCP App Views
When a tool execution completes and the tool has an associated MCP App View, the Harness SHALL push the tool execution result (including `structuredContent`) to the sandbox View via `AppHostManager.pushToApp()`.

#### Scenario: Tool result forwarded to View
- **WHEN** a tool with `_meta.ui.resourceUri` completes execution successfully
- **AND** the MCP App has been registered with AppHostManager
- **THEN** `pushToApp(appId, { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: toolResult })` SHALL be called

#### Scenario: Tool without UI is not forwarded
- **WHEN** a tool without `_meta.ui.resourceUri` completes execution
- **THEN** no push to AppHostManager SHALL occur

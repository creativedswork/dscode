## ADDED Requirements

### Requirement: TUI SHALL display MCP App URL when a tool with UI resource is executed
When the agent calls a tool that has `_meta.ui.resourceUri`, after the tool execution completes, the TUI SHALL display a notification with the local sandbox URL where the interactive UI can be viewed.

#### Scenario: Tool with UI shows app URL in TUI
- **WHEN** agent calls a tool with `_meta.ui.resourceUri: "ui://example/dashboard"`
- **AND** the UI resource HTML is successfully fetched
- **AND** the app is registered with AppHostManager
- **THEN** the TUI SHALL display "📱 MCP App available: http://127.0.0.1:<port>/app/<id>"

#### Scenario: Tool without UI shows no URL
- **WHEN** agent calls a tool without `_meta.ui.resourceUri`
- **THEN** no MCP App URL notification SHALL be displayed

#### Scenario: UI resource fetch fails gracefully
- **WHEN** agent calls a tool with `_meta.ui.resourceUri`
- **AND** the `resources/read` call fails or returns invalid content
- **THEN** the tool result SHALL still be displayed (text-only fallback)
- **THEN** an error SHALL be logged but no crash SHALL occur

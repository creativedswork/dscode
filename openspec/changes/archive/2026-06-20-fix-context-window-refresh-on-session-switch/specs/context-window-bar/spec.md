## MODIFIED Requirements

### Requirement: Bar updates in real-time
The ContextWindowBar SHALL update its display each time a new `context_window` event is received from the WebSocket connection.

#### Scenario: Bar updates after tool call
- **WHEN** a tool call completes and the server sends an updated `context_window` event
- **THEN** the bar's segments and numerical summary SHALL re-render to reflect the new token counts

#### Scenario: Bar updates after turn completes
- **WHEN** the assistant turn ends and the server sends an updated `context_window` event
- **THEN** the bar's segments and summary SHALL re-render

#### Scenario: Bar updates after session load
- **WHEN** a saved session is loaded and the server sends `ready` with the restored messages
- **THEN** the server SHALL also broadcast a `context_window` event reflecting the loaded session's token breakdown
- **AND** the bar's segments and numerical summary SHALL re-render to reflect the loaded session's token counts

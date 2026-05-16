## ADDED Requirements

### Requirement: AppHostManager SHALL push messages to connected sandbox View clients
AppHostManager SHALL provide a `pushToApp(appId, message)` method that writes a JSON-RPC message to all SSE clients connected for that app instance.

#### Scenario: Push tool result to connected SSE client
- **WHEN** `pushToApp(appId, { jsonrpc: "2.0", method: "ui/notifications/tool-result", params: {...} })` is called
- **AND** at least one SSE client is connected for that appId
- **THEN** each connected client SHALL receive `data: {"jsonrpc":"2.0","method":"ui/notifications/tool-result","params":{...}}\n\n`

#### Scenario: Push to app with no clients
- **WHEN** `pushToApp(appId, message)` is called
- **AND** no SSE clients are connected for that appId
- **THEN** the call SHALL succeed silently (no-op)

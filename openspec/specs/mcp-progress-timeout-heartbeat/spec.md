# mcp-progress-timeout-heartbeat Specification

## Purpose
TBD - created by archiving change mcp-progress-heartbeat-timeout. Update Purpose after archive.
## Requirements
### Requirement: PendingEntry stores timeout duration
`MCPClient`'s internal `PendingEntry` type SHALL include a `timeoutMs` field that records the inactivity timeout duration for each request. This value SHALL equal the `timeout` parameter passed to `request()`.

#### Scenario: PendingEntry records timeout on request creation
- **WHEN** `MCPClient.request()` is called with `timeout = 120000`
- **THEN** the created `PendingEntry` SHALL have `timeoutMs = 120000`

### Requirement: resetTimeout restarts the inactivity timer
`MCPClient` SHALL expose a private `resetTimeout(id: string | number)` method that clears the existing `setTimeout` timer for a pending request and starts a new one with the same `timeoutMs` duration.

#### Scenario: resetTimeout restarts timer while request is pending
- **WHEN** `resetTimeout(token)` is called for an active pending request
- **THEN** the existing timer SHALL be cleared via `clearTimeout`
- **AND** a new timer SHALL be started via `setTimeout` with the original `timeoutMs`
- **AND** the new timer's callback SHALL trigger the same timeout rejection logic (cleanup + `notifications/cancelled` + reject)

#### Scenario: resetTimeout is a no-op for missing entries
- **WHEN** `resetTimeout(token)` is called but no pending entry exists for that token
- **THEN** no error SHALL be thrown
- **AND** no side effects SHALL occur

### Requirement: Progress notification resets the timeout
When `MCPClient.handleNotification` receives a `notifications/progress` message, it SHALL call `resetTimeout(pp.progressToken)` to extend the request deadline. This SHALL happen BEFORE emitting the progress event to listeners.

#### Scenario: Progress notification extends timeout for matching request
- **WHEN** a `notifications/progress` notification arrives with `progressToken` matching an active pending request
- **THEN** the request's inactivity timer SHALL be reset to `timeoutMs`
- **AND** the progress event SHALL still be emitted to listeners with `toolName` from the pending entry

#### Scenario: Progress notification for unmatched token does nothing
- **WHEN** a `notifications/progress` notification arrives with a `progressToken` that has no matching pending request
- **THEN** `resetTimeout` SHALL be a no-op (no matching entry)
- **AND** the progress event SHALL still be emitted to listeners (with `toolName: undefined`)

#### Scenario: Long-running tool with progress survives default timeout
- **WHEN** `callTool` starts a tool with default 120s inactivity timeout
- **AND** the server sends `notifications/progress` every 30 seconds for 10 minutes
- **THEN** each progress notification SHALL reset the inactivity timer
- **AND** the request SHALL NOT time out
- **AND** the request SHALL complete successfully when the server returns a result

### Requirement: callTool and readResource respect config.requestTimeoutMs
`MCPClient.callTool()` and `MCPClient.readResource()` SHALL pass `this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT` as the timeout argument to `request()`, allowing per-server timeout configuration. When `requestTimeoutMs` is not set in the server config, `TOOL_CALL_TIMEOUT` SHALL be used as the default.

#### Scenario: callTool uses configured requestTimeoutMs
- **WHEN** a server config has `requestTimeoutMs: 300000`
- **AND** `callTool("search", args)` is invoked
- **THEN** the underlying `request()` SHALL be called with `timeout = 300000`

#### Scenario: callTool falls back to TOOL_CALL_TIMEOUT when not configured
- **WHEN** a server config has no `requestTimeoutMs` field
- **AND** `callTool("search", args)` is invoked
- **THEN** the underlying `request()` SHALL be called with `timeout = TOOL_CALL_TIMEOUT`

### Requirement: Inactivity timeout still fires when progress stops
When a server stops sending progress notifications and no result arrives within the inactivity window, the timeout SHALL fire exactly as before — cleaning up the pending entry, sending `notifications/cancelled`, and rejecting the promise.

#### Scenario: Server stops sending progress and hangs
- **WHEN** `callTool` starts with a 120s inactivity timeout
- **AND** the server sends progress for 30 seconds then stops
- **AND** no result arrives within 120s of the last progress event
- **THEN** the timeout SHALL fire
- **AND** the pending entry SHALL be cleaned up
- **AND** a `notifications/cancelled` SHALL be sent
- **AND** the promise SHALL reject with a timeout error


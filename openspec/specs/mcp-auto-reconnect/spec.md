# mcp-auto-reconnect Specification

## Purpose
TBD - created by archiving change mcp-connection-resilience. Update Purpose after archive.
## Requirements
### Requirement: MCPClient emits disconnected event on transport failure
When an MCPClient's underlying transport fails, the client SHALL emit a `"disconnected"` event so that MCPManager can initiate automatic reconnection.

#### Scenario: Stdio process exits unexpectedly
- **WHEN** a stdio MCP client's child process exits with a non-zero code or is killed by a signal
- **AND** the client is not intentionally closing (`closing === false`)
- **THEN** the client sets `closed = true`, rejects all pending requests, and emits `{ type: "disconnected", serverName, reason: "MCP server \"<name>\" exited with code <code>" }`

#### Scenario: Stdio process errors
- **WHEN** a stdio MCP client's child process emits an `"error"` event
- **AND** the client is not intentionally closing
- **THEN** the client sets `closed = true`, rejects all pending requests, and emits `{ type: "disconnected", serverName, reason: "MCP server \"<name>\" error: <message>" }`

#### Scenario: SSE stream ends unexpectedly
- **WHEN** an SSE MCP client's stream emits `"end"` (server closed the connection)
- **AND** the client is not already closed
- **THEN** the client sets `closed = true`, rejects all pending requests, and emits `{ type: "disconnected", serverName, reason: "MCP server \"<name>\" SSE connection closed" }`

#### Scenario: Streamable HTTP request fails with connection error
- **WHEN** a streamable HTTP MCP client's `sendHttpMessage` fails with ECONNREFUSED, ETIMEDOUT, or a 5xx status
- **AND** the request is a tool call or list tools (not a notification)
- **THEN** the client rejects the pending request with the error and emits `{ type: "disconnected", serverName, reason: "MCP HTTP error: <message>" }`

#### Scenario: Client closing intentionally does not emit disconnected
- **WHEN** the MCPClient is intentionally closing (`closing === true`) via `close()` called by `MCPManager.shutdown()` or `disconnectServer()`
- **AND** the process exits or SSE stream ends
- **THEN** no `"disconnected"` event is emitted

### Requirement: MCPManager auto-reconnects on disconnected event
When MCPManager receives a `"disconnected"` event from an MCPClient, it SHALL transition the server state to `"reconnecting"` and initiate a reconnect loop with exponential backoff.

#### Scenario: Manager starts reconnect on disconnected event
- **WHEN** MCPManager receives `{ type: "disconnected", serverName: "open-design", reason: "MCP server \"open-design\" exited with code 1" }`
- **AND** the server's current status is `"connected"`
- **THEN** the server state transitions to `"reconnecting"`
- **AND** `scheduleReconnect("open-design", 0)` is called (attempt 0 = immediate first attempt)

#### Scenario: Reconnect succeeds and server returns to connected
- **WHEN** `scheduleReconnect` calls `reconnectServer()` and it succeeds
- **THEN** the server state transitions to `"connected"` with updated tool count
- **AND** the new client's tools are registered via `registerDriver()`

#### Scenario: Reconnect fails with transient error and retries
- **WHEN** `reconnectServer()` fails with a transient error (e.g., ECONNREFUSED)
- **AND** the attempt count is less than 10
- **THEN** `scheduleReconnect(serverName, attempt + 1)` is called with a delay of `min(30000, 1000 * 2^attempt) + random(0, 500)` milliseconds

#### Scenario: Reconnect exhausts max retries
- **WHEN** `reconnectServer()` fails for the 10th time
- **THEN** the server state transitions to `"error"` with the last error message
- **AND** no further reconnect attempts are scheduled

#### Scenario: Reconnect fails with permanent error and stops immediately
- **WHEN** `reconnectServer()` fails with a permanent error (e.g., 401 Unauthorized)
- **THEN** the server state transitions to `"error"` with the error message
- **AND** no further reconnect attempts are scheduled

#### Scenario: User disconnects during reconnect and cancels retries
- **WHEN** `scheduleReconnect` is about to execute an attempt
- **AND** the server state has transitioned to `"disconnected"` (user explicitly disconnected)
- **THEN** the reconnect attempt is cancelled and no further retries are scheduled

### Requirement: Reconnect uses exponential backoff with jitter
The `scheduleReconnect` method SHALL calculate retry delays using exponential backoff with a 30-second cap and random jitter to prevent thundering herd problems.

#### Scenario: Backoff follows exponential curve
- **WHEN** attempt 0 fails and attempt 1 is scheduled
- **THEN** the delay is approximately 1000ms (+ jitter)
- **WHEN** attempt 5 fails and attempt 6 is scheduled
- **THEN** the delay is approximately 32000ms, capped at 30000ms (+ jitter)

#### Scenario: Jitter prevents synchronized retries
- **WHEN** two servers both disconnect simultaneously
- **THEN** their retry timers have different delays due to random jitter (0–500ms added to each)

### Requirement: MCP server state includes reconnecting status
The `MCPServerStatus` type SHALL include a `"reconnecting"` value, distinct from `"connecting"`, so that UIs can differentiate between initial connection and automatic reconnection.

#### Scenario: Server transitions through reconnecting state
- **WHEN** a `"disconnected"` event is received for a server
- **THEN** the server state transitions: `"connected"` → `"reconnecting"` → (eventually) `"connected"` or `"error"`

#### Scenario: Reconnecting state is distinct from connecting
- **WHEN** a server is in `"reconnecting"` state
- **THEN** its state is distinguishable from `"connecting"` (initial startup connection) via the status field

### Requirement: Error classification distinguishes transient from permanent failures
The system SHALL classify connection errors as transient, session-expired, or permanent to determine the appropriate recovery strategy.

#### Scenario: Connection refused is transient
- **WHEN** a connection attempt fails with ECONNREFUSED
- **THEN** the error is classified as `"transient"` and eligible for retry

#### Scenario: HTTP 502 is transient
- **WHEN** a streamable HTTP request returns status 502
- **THEN** the error is classified as `"transient"` and eligible for retry

#### Scenario: HTTP 401 is permanent
- **WHEN** a streamable HTTP request returns status 401
- **THEN** the error is classified as `"permanent"` and no retries are attempted

#### Scenario: Invalid configuration is permanent
- **WHEN** `connectServer()` fails because the server config has no command or URL
- **THEN** the error is classified as `"permanent"` and no retries are attempted


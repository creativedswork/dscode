## ADDED Requirements

### Requirement: Streamable HTTP client transparently recovers from session expiry
When a streamable HTTP MCP client receives a 404 or 410 HTTP response without an `Mcp-Session-Id` header, it SHALL transparently re-initialize the session and retry the original request once before surfacing an error.

#### Scenario: Session expires and recovery succeeds
- **WHEN** `sendHttpMessage` for a tool call receives a 404 response with no `Mcp-Session-Id` header
- **AND** the request is not an `initialize` request
- **THEN** the client calls `connectStreamableHttp()` to establish a new session
- **AND** the new `Mcp-Session-Id` from the re-initialize response is stored
- **AND** the original request is retried once with the new session ID
- **AND** if the retry succeeds, the result is returned to the caller as if no error occurred

#### Scenario: Session expires and recovery also fails
- **WHEN** session recovery is attempted (re-initialize + retry)
- **AND** the re-initialize succeeds but the retried request also returns 404
- **THEN** the original error is surfaced to the caller (no infinite retry loop)
- **AND** a `"disconnected"` event is emitted so that MCPManager can attempt full reconnection

#### Scenario: Session expires and re-initialize itself fails
- **WHEN** session recovery is attempted
- **AND** the re-initialize call fails (e.g., connection refused)
- **THEN** the error is surfaced as a connection failure
- **AND** a `"disconnected"` event is emitted

#### Scenario: Healthy request with session rotation
- **WHEN** a streamable HTTP request succeeds with a 200 status
- **AND** the response includes a new `Mcp-Session-Id` header different from the stored session ID
- **THEN** the client updates its stored session ID to the new value

#### Scenario: Stdio transport never triggers session recovery
- **WHEN** an MCP client is using stdio transport
- **THEN** session recovery logic is never invoked (it only applies to streamable HTTP)

### Requirement: Session recovery does not interfere with normal operation
Session recovery SHALL be transparent to callers — the caller receives the result or error without knowledge that recovery occurred.

#### Scenario: Caller sees normal result after recovery
- **WHEN** a tool call triggers session recovery that succeeds
- **THEN** the caller receives the tool result normally
- **AND** no special error or status code indicates that recovery happened

#### Scenario: Recovery latency is bounded
- **WHEN** session recovery triggers a re-initialize call
- **THEN** the total additional latency is bounded by the re-initialize request timeout (default 30s) plus one retry
- **AND** the original request's timeout is preserved across the recovery attempt

## ADDED Requirements

### Requirement: AppHostManager SHALL start a local HTTP server on a random port bound to 127.0.0.1
When enabled, dscode SHALL start an AppHostManager with a `node:http` server listening on `127.0.0.1` with a random available port. The server SHALL serve the sandbox proxy page and a JSON-RPC bridge API.

#### Scenario: Server starts on localhost random port
- **WHEN** AppHostManager.start() is called
- **THEN** an HTTP server SHALL listen on 127.0.0.1 on an OS-assigned port
- **THEN** the assigned port SHALL be retrievable via `appHostManager.getPort()`

#### Scenario: Server rejects non-localhost connections
- **WHEN** a connection attempt comes from a non-loopback address
- **THEN** the connection SHALL be rejected

### Requirement: Sandbox proxy page SHALL render MCP App HTML in a sandboxed iframe
The `GET /app/:id` endpoint SHALL return a sandbox.html page that renders the MCP App HTML in a sandboxed inner iframe using `srcdoc`. The response SHALL include a Content-Security-Policy header constructed from the resource's CSP metadata.

#### Scenario: App page returns sandbox with CSP
- **WHEN** a browser requests `GET /app/:id` for a registered app
- **THEN** the response SHALL have status 200 with `Content-Type: text/html`
- **THEN** the response SHALL include a `Content-Security-Policy` header
- **THEN** the returned HTML SHALL contain a sandboxed iframe element

#### Scenario: Default CSP blocks all network access
- **WHEN** an app is registered without CSP metadata (`csp` omitted)
- **THEN** the CSP header SHALL include `connect-src 'none'`
- **THEN** the CSP header SHALL include `frame-src 'none'`

#### Scenario: CSP includes declared domains
- **WHEN** an app is registered with `csp: { connectDomains: ["https://api.example.com"] }`
- **THEN** the CSP header SHALL include `connect-src 'self' https://api.example.com`

### Requirement: Bridge API SHALL relay JSON-RPC messages
The `POST /api/bridge/:id` endpoint SHALL accept JSON-RPC requests from the sandbox proxy and proxy relevant requests (tools/call, resources/read) to the connected MCP server. The `GET /api/bridge/:id/events` endpoint SHALL provide an SSE stream for Host-to-View notifications.

#### Scenario: tools/call is proxied to MCP server
- **WHEN** the sandbox sends `{ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "get-time", arguments: {} } }` to POST /api/bridge/:id
- **THEN** the request SHALL be forwarded to the appropriate MCP client
- **THEN** the response SHALL be JSON-RPC with the tool result

#### Scenario: Unknown method returns error
- **WHEN** the sandbox sends a request with an unsupported method
- **THEN** the response SHALL be `{ jsonrpc: "2.0", id: N, error: { code: -32601, message: "Method not found" } }`

### Requirement: AppHostManager SHALL shut down cleanly
When `AppHostManager.shutdown()` is called, all registered apps SHALL be unregistered and the HTTP server SHALL close.

#### Scenario: Shutdown closes server and clears apps
- **WHEN** AppHostManager.shutdown() is called
- **THEN** the HTTP server SHALL stop accepting new connections
- **THEN** all registered apps SHALL be removed from memory

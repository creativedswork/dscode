## MODIFIED Requirements

### Requirement: Sandbox proxy page SHALL render MCP App HTML in a sandboxed iframe OR data-driven MDX layout

The `GET /app/:id` endpoint SHALL return a sandbox.html page. When the app was registered with an HTML string (legacy mode), it SHALL render the HTML in a sandboxed inner iframe using `srcdoc`. When the app was registered with MDX layout and data (data mode), it SHALL render components using the built-in MDX Runtime. The response SHALL include a Content-Security-Policy header constructed from the resource's CSP metadata.

#### Scenario: App page returns sandbox with CSP

- **WHEN** a browser requests `GET /app/:id` for a registered app
- **THEN** the response SHALL have status 200 with `Content-Type: text/html`
- **THEN** the response SHALL include a `Content-Security-Policy` header

#### Scenario: Data mode renders MDX components

- **WHEN** an app is registered with `mdx: "<Chart .../>"` and `data: {...}` (no `html` field)
- **THEN** the sandbox page SHALL invoke the MDX Runtime to parse and render the layout
- **AND** data bindings SHALL resolve from the `data` field

#### Scenario: Default CSP allows self-connect

- **WHEN** an app is registered without CSP metadata (`csp` omitted)
- **THEN** the CSP header SHALL include `connect-src 'self'`
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

#### Scenario: ui/initialize is handled

- **WHEN** the sandbox sends `{ jsonrpc: "2.0", id: 1, method: "ui/initialize", params: {...} }`
- **THEN** the response SHALL be `{ jsonrpc: "2.0", id: 1, result: { hostContext: { appId } } }`

#### Scenario: Unknown method returns error

- **WHEN** the sandbox sends a request with an unsupported method
- **THEN** the response SHALL be `{ jsonrpc: "2.0", id: N, error: { code: -32601, message: "Method not found" } }`

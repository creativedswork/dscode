## ADDED Requirements

### Requirement: MCPClient.request accepts AbortSignal
The `MCPClient.request()` method SHALL accept an optional `signal?: AbortSignal` parameter. When the signal is aborted before or during the request, the returned promise SHALL reject with a `DOMException` whose `name` is `"AbortError"`.

#### Scenario: Signal already aborted before request
- **WHEN** `MCPClient.request()` is called with an `AbortSignal` that is already aborted
- **THEN** the returned promise SHALL reject immediately with an `AbortError`
- **AND** no network request or stdio write SHALL be made

#### Scenario: Signal aborted during in-flight stdio request
- **WHEN** `MCPClient.request()` is called via stdio transport with an `AbortSignal` AND the signal is aborted while waiting for a response
- **THEN** the pending entry SHALL be removed from the internal `pending` map
- **AND** the returned promise SHALL reject with an `AbortError`
- **AND** a `notifications/cancelled` JSON-RPC notification SHALL be sent to the server with the corresponding `requestId`

#### Scenario: Signal aborted during in-flight streamable-http request
- **WHEN** `MCPClient.request()` is called via streamable-http transport with an `AbortSignal` AND the signal is aborted while the HTTP request is in-flight
- **THEN** `req.destroy()` SHALL be called on the underlying `http.ClientRequest`
- **AND** the pending entry SHALL be cleaned up
- **AND** the returned promise SHALL reject with an `AbortError`

#### Scenario: Signal aborted during in-flight SSE POST request
- **WHEN** `MCPClient.request()` is called via SSE transport with an `AbortSignal` AND the signal is aborted while the POST request is in-flight
- **THEN** `req.destroy()` SHALL be called on the underlying `http.ClientRequest`
- **AND** the pending entry SHALL be cleaned up
- **AND** the returned promise SHALL reject with an `AbortError`

#### Scenario: Request completes before signal aborts
- **WHEN** `MCPClient.request()` is called with an `AbortSignal` AND the request completes successfully before the signal fires
- **THEN** the abort event listener SHALL be removed from the signal
- **AND** the promise SHALL resolve with the normal result

#### Scenario: No signal provided — backward compatible
- **WHEN** `MCPClient.request()` is called without an `AbortSignal`
- **THEN** the method SHALL behave exactly as before (no abort support, normal timeout behavior)

### Requirement: MCPClient.callTool and readResource accept AbortSignal
The `MCPClient.callTool(name, args, signal?)` and `MCPClient.readResource(uri, signal?)` methods SHALL accept an optional `AbortSignal` and pass it through to `request()`.

#### Scenario: callTool forwards signal
- **WHEN** `client.callTool("search", { query: "test" }, mySignal)` is called
- **THEN** the signal SHALL be passed to `this.request("tools/call", { name: "search", arguments: { query: "test" } }, TOOL_CALL_TIMEOUT, true, mySignal)`

#### Scenario: readResource forwards signal
- **WHEN** `client.readResource("app://ui", mySignal)` is called
- **THEN** the signal SHALL be passed to `this.request("resources/read", { uri: "app://ui" }, TOOL_CALL_TIMEOUT, true, mySignal)`

### Requirement: MCPManager.buildAgentTool passes signal to MCPClient
The `MCPManager.buildAgentTool()` method SHALL pass the `signal` parameter received from `AgentTool.execute` directly to `client.callTool()`, so that agent-initiated abort propagates into MCP transport cancellation.

#### Scenario: Agent abort reaches MCP tool
- **WHEN** the agent loop calls `AgentTool.execute(toolCallId, params, signal)` AND `signal` is an `AbortSignal` from the agent's active run
- **THEN** `buildAgentTool`'s execute function SHALL call `client.callTool(def.name, args, signal)` with that same signal

#### Scenario: Signal is undefined
- **WHEN** the agent loop calls `AgentTool.execute(toolCallId, params, undefined)` (no signal)
- **THEN** `buildAgentTool`'s execute function SHALL call `client.callTool(def.name, args)` without a signal — backward compatible

### Requirement: MCP tool abort errors are user-friendly
When an MCP tool call is aborted, the error message returned to the agent SHALL clearly indicate cancellation rather than a generic failure.

#### Scenario: AbortError converted to user message
- **WHEN** `client.callTool()` rejects with an `AbortError`
- **THEN** the `AgentToolResult.content` SHALL contain a text block like `"Tool call aborted by user."`
- **AND** `details.error` SHALL be `true` so the agent knows the call did not succeed

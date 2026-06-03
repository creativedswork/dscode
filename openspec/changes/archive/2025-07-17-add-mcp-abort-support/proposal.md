## Why

When an MCP tool call is executing (e.g., a long-running `tools/call` over HTTP or stdio), users cannot abort it via Ctrl+C or the Stop button. The `Harness.abort()` method only cancels vision/OCR pre-processing and the current agent LLM turn — it does not propagate the abort signal into MCP tool execution. This means stuck or slow MCP servers make the entire UI unresponsive until the hardcoded 60-second timeout fires.

## What Changes

- **Propagate AbortSignal into MCPClient.request()**: Add an optional `signal?: AbortSignal` parameter to `MCPClient.request()` (and `callTool`, `readResource`), so callers can cancel in-flight MCP requests.
- **Wire harness abort into MCP tool execution**: In `MCPManager.buildAgentTool()`, pass the incoming `signal` (from the agent loop's `AgentTool.execute`) through to `client.callTool(def.name, args, signal)`.
- **Abort in-flight HTTP requests**: When the signal fires during a streamable-http or SSE POST request, destroy the underlying `http.ClientRequest` immediately.
- **Abort stdio-based calls**: When the signal fires during a stdio transport call, remove the pending entry and reject the promise with an `AbortError`, and send a `notifications/cancelled` to the server.
- **Expose abort state in HarnessAPI**: Ensure `Harness.abort()` also cancels any pending MCP tool calls by tracking and aborting them through the existing agent abort controller.

## Capabilities

### New Capabilities
- `mcp-tool-abort`: MCP tool calls accept and honor `AbortSignal` for cancellation during execution. Covers all three transports (stdio, streamable-http, SSE).

### Modified Capabilities
- `core-harness`: `Harness.abort()` SHALL also abort any in-flight MCP tool calls (in addition to existing vision and agent abort).

## Impact

- **`src/mcp/client.ts`**: `request()`, `callTool()`, `readResource()` signatures gain optional `AbortSignal`; HTTP request objects tracked for `.destroy()` on abort; pending map entries cleaned up on abort.
- **`src/mcp/manager.ts`**: `buildAgentTool()` passes `signal` through to `client.callTool()` instead of ignoring it.
- **`src/core/harness.ts`**: `abort()` method unchanged in API — already calls `agent.abort()` which propagates into tool execution via the existing abort signal wiring.
- **MCP protocol**: When aborting stdio transport calls, a `notifications/cancelled` JSON-RPC notification is sent to the MCP server so it can stop work server-side.

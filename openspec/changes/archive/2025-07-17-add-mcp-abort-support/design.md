## Context

Currently, `MCPClient.request()` executes MCP JSON-RPC calls with fixed timeouts (30s for general requests, 60s for tool calls) and no external cancellation mechanism. When the user presses Ctrl+C or clicks Stop, `Harness.abort()` calls `agent.abort()`, which sets an `AbortSignal` on the agent's active run. This signal flows into `AgentTool.execute(signal)` — but `MCPManager.buildAgentTool()` ignores it (the parameter is named `_signal`).

There are three MCP transports, each with different cancellation characteristics:

| Transport | Request mechanism | Cancellable? |
|-----------|------------------|--------------|
| **stdio** | Write JSON-RPC to child process stdin, read response from stdout `readline` | Only by killing the child process or sending `notifications/cancelled` |
| **streamable-http** | `http.request()` POST with response handling | Yes — `req.destroy()` cancels the HTTP request |
| **SSE (legacy)** | GET for event stream + POST for requests | POST requests can be destroyed; GET event stream already tracked as `activeSseRequest` |

The agent loop's `ToolExecutionMode` is `"parallel"` by default, meaning multiple MCP tool calls can execute concurrently. When the user aborts, all in-flight calls should cancel.

## Goals / Non-Goals

**Goals:**
- Propagate the agent's `AbortSignal` through `MCPManager` → `MCPClient.callTool()` → `MCPClient.request()` so Ctrl+C / Stop immediately cancels MCP tool execution.
- `MCPClient.request()` MUST reject with an `AbortError` (DOMException with name `"AbortError"`) when aborted, so callers can distinguish cancellation from other failures.
- Support abort across all three transports: stdio, streamable-http, and SSE.
- When aborting a stdio call, send a `notifications/cancelled` JSON-RPC notification so the server can stop working.
- Track in-flight HTTP request objects so they can be explicitly destroyed on abort.

**Non-Goals:**
- Aborting individual MCP tool calls selectively (all concurrent calls abort together when the agent aborts).
- Server-initiated cancellation (`notifications/cancelled` from server to client is already handled as an event).
- Changing the `TOOL_CALL_TIMEOUT` or other timeout constants.
- MCP `ping` or `initialize` abort support (only `tools/call` and `resources/read` need it).

## Decisions

### Decision 1: Add `signal?: AbortSignal` to `MCPClient.request()` and all public callers

**Choice**: Thread `signal` through `callTool()`, `readResource()`, and the internal `request()` method.

**Alternatives considered**:
- **Per-client AbortController**: Store a single `AbortController` on `MCPClient` and abort all pending requests at once. Rejected because the agent loop uses `AbortSignal` per-run and we should match that pattern.
- **Return an `abort()` callback from `callTool()`**: Too invasive; callers would need to track and call it manually. The signal pattern already works everywhere else in the codebase.

### Decision 2: Abort implementation per transport

**stdio**: When the signal fires, remove the pending entry from the `pending` map, reject with `AbortError`, and send `notifications/cancelled` to the server via stdin. Do NOT kill the child process — the server may be handling other concurrent requests.

**streamable-http**: When the signal fires, call `req.destroy()` on the tracked `ClientRequest` object. This triggers the request's `error` event, which already cleans up the pending entry.

**SSE (POST requests)**: Same as streamable-http — track the `req` and call `req.destroy()` on abort.

### Decision 3: AbortError type

**Choice**: Use `DOMException` with name `"AbortError"` (available since Node.js 17). This matches the pattern already used in `src/drivers/vision/`.

**Rationale**: The agent loop already recognizes `AbortError`-like failures and handles them gracefully (emitting `stopReason: "aborted"` instead of `"error"`).

### Decision 4: Signal listener cleanup

**Choice**: Register a one-shot `abort` event listener on the signal. When it fires, perform cleanup and remove the listener. If the request completes normally first, remove the listener without firing.

**Rationale**: Avoids leaking event listeners on long-lived signals.

### Decision 5: `buildAgentTool` wiring

**Choice**: Simply rename `_signal` to `signal` and pass it to `client.callTool(def.name, args, signal)`.

**No changes needed in `Harness.abort()`**: The agent's abort controller is already created per-run and passed to tool `execute`. When `Harness.abort()` calls `agent.abort()`, the signal fires and the MCP tool's execute function will receive it.

## Risks / Trade-offs

- **[Risk] stdio transport: server ignores `notifications/cancelled`** → Mitigation: The client-side promise rejects immediately regardless; the server doing extra work is harmless. The pending entry is removed so responses from the cancelled request are silently dropped.
- **[Risk] Multiple concurrent tool calls on same server**: Aborting one tool call sends `notifications/cancelled` with the specific `requestId`, so the server can cancel just that call. Other in-flight calls on the same stdio connection continue normally.
- **[Risk] AbortError vs timeout error confusion**: Callers (like `buildAgentTool`) should check `err.name === "AbortError"` to distinguish user-initiated abort from genuine failures, and return an appropriate error message.
- **[Risk] SSE transport GET connection**: The existing `activeSseRequest` is for the event stream GET, not for individual POST requests. POST requests need separate tracking.

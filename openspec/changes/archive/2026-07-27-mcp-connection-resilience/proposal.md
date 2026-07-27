## Why

MCP connections die silently today. When a stdio process exits or an SSE stream drops, `MCPClient` sets `closed=true` and rejects all pending requests, but the `MCPManager` is never notified — server state stays "connected" and the UI shows a false green status. For streamable HTTP, there is no persistent connection at all, so session expiry goes undetected until a tool call fails. The existing `reconnectServer()` is only triggered by manual refresh and contains two bugs: infinite recursion on failure and variable shadowing in the catch block. This change makes MCP connections self-healing with automatic reconnect, exponential backoff, and transparent session recovery.

## What Changes

- **Automatic reconnect**: When `MCPClient` detects a disconnection (process exit, SSE stream end, streamable-http connection error), it emits a `"disconnected"` event to `MCPManager`, which starts a reconnect loop with exponential backoff
- **Reconnect backoff**: Exponential backoff (1s → 2s → 4s ... → 30s cap) with jitter, max 10 retries before permanent error
- **New `"reconnecting"` state**: A new `MCPServerStatus` value distinct from `"connecting"`, so the UI can show "reconnecting..." vs initial connection
- **Error classification**: Errors are classified as transient (retry), session-expired (re-initialize transparently), or permanent (stop). This prevents infinite retry loops on auth failures
- **Streamable HTTP session recovery**: When a 404/410 response arrives without an `Mcp-Session-Id` header, the client transparently re-initializes and retries the original request once
- **Bug fix: infinite recursion in `reconnectServer()`**: The recursive call on failure is replaced with proper backoff scheduling
- **Bug fix: variable shadowing in `reconnectServer()` catch block**: Inner `const state` no longer shadows the outer variable, so `state.toolCount = 0` sets on the correct object
- **Daemon restart (separate mechanism)**: In `main.ts`, when the Open Design daemon exits unexpectedly and `--with-od` is active, `main.ts` restarts the daemon independently of MCP reconnect logic

## Capabilities

### New Capabilities

- `mcp-auto-reconnect`: Automatic reconnect with exponential backoff when MCP client detects disconnection (process exit, SSE end, streamable-http connection error). Replaces the manual-refresh-only reconnect model with a self-healing approach.
- `mcp-session-recovery`: Transparent streamable HTTP session recovery. When a session expires (404/410 without `Mcp-Session-Id`), the client re-initializes and retries the request once before surfacing an error.

### Modified Capabilities

- `mcp-reconnect-on-refresh`: The existing `reconnectServer()` logic is refactored with backoff, error classification, and bug fixes (recursion + variable shadowing). The reconnect trigger expands from "only on manual refresh" to "automatic on disconnection events" while preserving the refresh-triggered path.

## Impact

- `src/mcp/types.ts` — new event type `"disconnected"`, new status `"reconnecting"`, new error classification enum
- `src/mcp/client.ts` — emit `"disconnected"` events on process exit/SSE end; classify HTTP errors; session recovery logic
- `src/mcp/manager.ts` — handle `"disconnected"` event → `scheduleReconnect()`; refactor `reconnectServer()` with backoff + error classification; fix recursion and shadowing bugs
- `src/core/main.ts` — add daemon restart on unexpected exit (when `--with-od` is active)
- `src/core/harness.ts` — no changes expected (MCPManager handles internally)
- Non-breaking: all changes are internal to MCP subsystem

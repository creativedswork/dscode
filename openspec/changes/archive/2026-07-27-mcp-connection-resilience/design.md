## Context

The MCP subsystem currently has no automatic reconnect capability. When a connection dies (stdio process exit, SSE stream close, streamable-http connection error), `MCPClient` sets `closed = true` and rejects all pending requests, but `MCPManager` is never notified. Server state remains `"connected"` in the UI despite the dead connection.

The existing `reconnectServer()` method in `MCPManager` is only triggered by manual refresh (via `registerDrivers()`) and contains two bugs: infinite recursion when reconnect fails (line 380 calls itself unconditionally), and variable shadowing in the catch block (line 377 shadows `state` from line 339, so `state.toolCount = 0` on line 388 targets the wrong object).

For streamable HTTP, session expiry is invisible — the server may return 404 without a session header, but the client has no recovery path.

The Open Design daemon (`src/core/od-daemon.ts`) is spawned in `main.ts` when `--with-od` is active. If the daemon dies, the MCP stdio process (which connects to the daemon) exits, triggering reconnect. The daemon restart is handled separately in `main.ts` — MCPManager does not need daemon awareness.

## Goals / Non-Goals

**Goals:**
- Close the notification gap: MCPClient emits `"disconnected"` events when connections die
- Automatic reconnect with exponential backoff (1s → 30s cap, max 10 retries)
- New `"reconnecting"` status visible in server state
- Error classification: transient (retry) vs session-expired (re-init) vs permanent (stop)
- Transparent streamable HTTP session recovery on 404/410 without session header
- Fix `reconnectServer()` recursion bug and variable shadowing bug
- Preserve existing stdio kill behavior on abort

**Non-Goals:**
- Liveness probes / health checks (can be added later)
- Daemon restart (separate mechanism in `main.ts`)
- UI changes for reconnecting state (spec-only; UI updates in a follow-up change)
- Retry logic for tool call results (only connection-level resilience)
- WebSocket or TUI protocol changes

## Decisions

### Decision 1: New `"disconnected"` event in MCPClientEvent

The existing `MCPClientEvent` union has no disconnection event. We add:

```typescript
{ type: "disconnected"; serverName: string; reason: string }
```

**Why not use existing events?** `"progress"`, `"message"`, `"tools_list_changed"` are all operational events. Disconnection is a lifecycle event that needs its own type so `MCPManager` can trigger reconnect.

**Emission points:**
- `process.on("exit")` in stdio transport
- `process.on("error")` in stdio transport
- `res.on("end")` in SSE transport
- `res.on("error")` in SSE transport
- Streamable HTTP: when `sendHttpMessage` fails with a connection-level error (ECONNREFUSED, ETIMEDOUT, 5xx) — emitted via `MCPManager` since the client only sees the failure on next tool call

### Decision 2: Reconnect scheduling in MCPManager

A new `scheduleReconnect(serverName, attempt)` method handles the backoff loop:

```
delay = min(30000, 1000 * 2^attempt) + random(0, 500)ms
```

After `setTimeout`, it calls a refactored `reconnectServer()`. On failure:
- If error is TRANSIENT and attempt < MAX_RETRIES (10): `scheduleReconnect(serverName, attempt + 1)`
- If error is SESSION_EXPIRED: `scheduleReconnect(serverName, 0)` (reset counter since this is a different failure mode)
- If error is PERMANENT or MAX_RETRIES exhausted: set state to `"error"`, stop

**Why exponential backoff?** Standard practice for reconnection. Linear backoff would either retry too fast (wasting CPU) or too slow (poor UX). Jitter prevents thundering herd when multiple servers die simultaneously.

**Why capped at 30s?** Beyond 30s, the user experience degrades significantly. After 10 retries (~5 minutes total with backoff), the server is likely permanently down and staying in reconnecting state is misleading.

### Decision 3: Error classification

A new `ErrorClass` type: `"transient"` | `"session_expired"` | `"permanent"`.

Classification logic in `classifyError(err: Error, transport: MCPTransport): ErrorClass`:

| Error pattern | Class |
|---|---|
| ECONNREFUSED, ETIMEDOUT, ENOTFOUND (for known hosts) | transient |
| HTTP 502, 503, 504 | transient |
| Process exit with non-zero code | transient |
| SSE stream closed unexpectedly | transient |
| HTTP 404/410 without `Mcp-Session-Id` header | session_expired |
| HTTP 401, 403 | permanent |
| ENOTFOUND (for unknown/unresolvable hosts) | permanent |
| Invalid config (missing command/URL) | permanent |

**Why classify at MCPManager level, not MCPClient?** The client knows the transport and error details, but the manager decides retry policy. The client emits errors; the manager classifies them.

### Decision 4: Streamable HTTP session recovery in MCPClient

When `request()` for streamable HTTP receives a 404 or 410 response without an `Mcp-Session-Id` header, the client:

1. Transparently calls `connectStreamableHttp()` to re-initialize
2. Stores the new session ID
3. Retries the original request once
4. If the retry fails, rejects with the original error

**Why in MCPClient, not MCPManager?** Session recovery is a transport-level concern. The manager shouldn't need to know about HTTP session semantics. The client handles it transparently — from the manager's perspective, the request just takes a bit longer.

**Why only one retry?** If re-initialization succeeds but the retry still fails, the problem is likely not session-related. Multiple retries would mask real issues and add latency.

### Decision 5: Daemon restart as separate mechanism

Daemon restart lives in `main.ts` alongside the existing daemon lifecycle:

```typescript
odChild.on("exit", (code, signal) => {
  // ...existing logging...
  
  // Auto-restart if daemon exited unexpectedly
  if (code !== 0 && code !== null && withOd) {
    const newChild = startOdDaemon(odDir, odPort);
    registerOdCleanup(newChild);
    // re-attach exit handler recursively
  }
});
```

**Why not in MCPManager?** The daemon is not an MCP concept. It's a dscode-level process manager concern. MCPManager should reconnect to whatever MCP servers are configured — it doesn't need to know which ones are daemon-backed.

### Decision 6: Fixing reconnectServer() bugs

**Recursion bug**: Replace `await this.reconnectServer(name)` with `this.scheduleReconnect(name, 0)`. This separates the "try once" logic (in `reconnectServer`) from the "schedule retries" logic (in `scheduleReconnect`).

**Variable shadowing**: Remove `const state = this.states.get(name)!` from the catch block (line 377). Use the outer `state` variable from line 339. The `state.toolCount = 0` line (388) then correctly targets the state object.

## Risks / Trade-offs

| Risk | Mitigation |
|---|---|
| **Reconnect storms**: Multiple servers dying simultaneously triggers multiple backoff timers | Jitter in backoff prevents synchronized retries; each server has independent attempt counter |
| **State inconsistency**: During reconnect, server state shows "reconnecting" but old tools may still be registered | `reconnectServer()` unregisters the old driver before attempting connection, so stale tools are removed immediately |
| **Streamable HTTP session recovery adds latency**: Re-initialize + retry adds one round-trip | Only triggered on session expiry (rare); capped at one retry |
| **Daemon restart race**: Daemon restarts while MCP is mid-reconnect | Both are idempotent — MCP reconnect spawns a new process that connects to whatever daemon is available; backoff naturally absorbs the daemon startup window |
| **Breaking existing manual reconnect**: Users who rely on manual refresh to trigger reconnect | Manual refresh still works — `registerDrivers()` still calls `reconnectServer()` on failure, which now uses the same backoff-scheduled path |

## Open Questions

1. **Should `scheduleReconnect` be cancellable?** If a user explicitly disconnects a server (status → `"disconnected"`), the pending reconnect timer should be cancelled. Answer: Yes — check `state.status === "disconnected"` before each attempt.

2. **Should reconnect emit UI events?** Currently, `MCPManager` emits `"tools_refreshed"` and `"tools_refresh_failed"` events through `handleClientEvent`. For reconnect, we should emit similar events so the UI can show status changes. Answer: Yes — emit `"tools_reconnecting"` on first attempt and `"tools_refreshed"` / `"tools_refresh_failed"` on completion.

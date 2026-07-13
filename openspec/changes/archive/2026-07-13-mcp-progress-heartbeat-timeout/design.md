## Context

`MCPClient` manages per-request timeouts via `setTimeout` stored on `PendingEntry.timer`. Currently the timer is created once on request dispatch and fires unconditionally after `timeout` ms — regardless of whether the MCP server is actively sending `notifications/progress`. The hardcoded `TOOL_CALL_TIMEOUT = 60_000` further prevents users from configuring longer timeouts for slow tools.

With `mcp-tool-progress-inline` now surfacing progress to the Web UI, users see active progress between the 60s mark and tool completion — only to have the request killed by timeout. The fix: treat progress notifications as a heartbeat that resets the inactivity timer.

## Goals / Non-Goals

**Goals:**
- Reset the per-request timeout on every `notifications/progress` from the MCP server
- Honor `MCPServerConfig.requestTimeoutMs` for `callTool` and `readResource` (currently ignored)
- Bump `TOOL_CALL_TIMEOUT` to 120s as a more reasonable inactivity tolerance
- Keep existing abort/cancellation behavior unchanged

**Non-Goals:**
- Changing timeout behavior for `request()` calls from other methods (initialize, listTools, etc.)
- Per-request timeout configuration (only per-server via `requestTimeoutMs`)
- Timeout behavior for non-MCP tool calls
- Any changes to the WebSocket protocol or UI

## Decisions

### Decision 1: Store timeoutMs on PendingEntry

**Chosen**: Add `timeoutMs: number` to `PendingEntry`, set at request creation time.

**Alternatives considered**:
- Use a separate `Map<id, timeoutMs>` — rejected; fragments related state
- Re-derive timeout from config on every reset — rejected; config may change during request lifetime

**Rationale**: The timeout duration is a property of the request, not the client. Storing it on the entry keeps the data local and avoids config-read race conditions.

### Decision 2: resetTimeout(id) method

**Chosen**: Private method `resetTimeout(id: string | number)` that clears the existing timer and creates a new one.

```typescript
private resetTimeout(id: string | number): void {
  const entry = this.pending.get(id);
  if (!entry) return;
  clearTimeout(entry.timer);
  entry.timer = setTimeout(() => {
    this.pending.delete(id);
    entry.cleanup();
    if (entry.method !== "initialize") {
      this.sendNotification("notifications/cancelled", {
        requestId: id,
        reason: `Request timed out after ${entry.timeoutMs}ms of inactivity`,
      });
    }
    entry.reject(new Error(`MCP request "${entry.method}" timed out after ${entry.timeoutMs}ms`));
  }, entry.timeoutMs);
}
```

**Alternatives considered**:
- Inline the timer reset in `handleNotification` — rejected; duplicates timeout creation logic
- Use a single shared `Map<id, timer>` managed externally — rejected; adds indirection

**Rationale**: Extracted method avoids duplication. The timeout callback mirrors the existing `request()` timeout logic exactly (cleanup + cancel notification + reject).

### Decision 3: PendingEntry gains a cleanup callback

**Chosen**: Add `cleanup: () => void` to `PendingEntry` that encapsulates `clearTimeout(entry.timer)` + `signal.removeEventListener("abort", onAbort)`.

The current `request()` method defines `cleanup` as a closure inside the promise constructor. We extract it to `PendingEntry.cleanup` so `resetTimeout` can call it before restarting the timer.

**Alternatives considered**:
- Keep cleanup as closure, pass it separately — rejected; already have the closure, just store it
- Don't call cleanup on reset — rejected; would leak abort event listeners

### Decision 4: TOOL_CALL_TIMEOUT bump: 60s → 120s

**Chosen**: Increase the hardcoded default from 60s to 120s.

This is the **inactivity tolerance**, not total execution time. With heartbeat resets, 120s of silence from the server is a strong "something is wrong" signal. Most progress-emitting servers send updates every 5-30 seconds, so 120s gives ample headroom before timing out a hung server.

### Decision 5: callTool timeout param: config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT

**Chosen**: Change `callTool` and `readResource` to use `this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT` instead of the hardcoded `TOOL_CALL_TIMEOUT`.

```typescript
// Before
return this.request("tools/call", { name, arguments: args }, TOOL_CALL_TIMEOUT, true, signal, name);

// After
return this.request("tools/call", { name, arguments: args }, this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT, true, signal, name);
```

**Rationale**: `requestTimeoutMs` already exists on `MCPServerConfig` and is used by the default `request()` timeout param. This just makes `callTool`/`readResource` consistent.

## Risks / Trade-offs

- **[Risk] Progress events don't arrive for some tools** → Mitigation: The base inactivity timeout still fires. Tools that don't emit progress keep the same timeout behavior.
- **[Risk] Very frequent progress (e.g., every 100ms) causes timer churn** → Mitigation: `clearTimeout` + `setTimeout` is trivially cheap. Harness already throttles progress emission by bucket (see `progressBucket` in harness.ts).
- **[Risk] PendingEntry.cleanup must be called exactly once** → Mitigation: `resetTimeout` only calls cleanup for the OLD timer, not the new one. The final timeout/rejection calls cleanup once. The abort path also calls cleanup once. These paths are mutually exclusive (timeout fires OR abort fires OR request resolves).

## Open Questions

- Should we also add a `requestTimeoutMs` field to the MCP server UI in the sidebar for runtime configuration? (Out of scope for this change — config file editing is sufficient.)

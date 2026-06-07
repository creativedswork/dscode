## Context

`MCPManager` maintains a map of `MCPClient` instances keyed by server name. When an external MCP server process dies and restarts, the old `MCPClient`'s underlying transport (stdio pipe, HTTP session) is gone — but `MCPManager` still holds the dead client and shows `status: "connected"` in its state.

The "Refresh" action calls `registerDrivers()`, which iterates existing clients and calls `listTools()`. When that fails, the catch branch only sets `state.status = "error"` — it never closes the dead client or attempts reconnection. Additionally, `connectServer()` has an early-return guard (`if (existing) return`) that prevents reconnection even if the user explicitly clicks "Connect".

Reconnection only needs to happen on explicit user action (Refresh / Connect), not automatically on every tool call or notification hiccup.

## Goals / Non-Goals

**Goals:**
- When a user clicks "Refresh" and a previously-connected server is now unreachable, attempt one reconnection before reporting error
- When a user clicks "Connect" on a server whose state is "error" (but has a stale client), reconnect rather than skip
- Keep reconnection async and non-blocking for both Web and TUI paths

**Non-Goals:**
- Automatic background reconnect on every `listTools()` failure (e.g., during tool calls)
- Health-check polling or ping/heartbeat mechanism
- Handling reconnect for servers that were manually disconnected (status "disconnected" should stay disconnected)

## Decisions

### Decision 1: Reconnect in `registerDrivers` catch, not in the caller

**Rationale**: `registerDrivers` owns the client lifecycle. The caller (`handleMcp` / TUI refresh) shouldn't need to know about transport-level reconnect logic. Keeping it inside `MCPManager` keeps the concern in one place.

**Alternative considered**: Handle reconnect in `handleMcp("refresh")` by calling `disconnectServer` + `connectServer` before `registerDrivers`. Rejected because it adds transport knowledge to the UI layer and would duplicate logic for TUI.

### Decision 2: One attempt, no retry loop

**Rationale**: If the server is down, retrying multiple times just adds latency with no benefit. User can click Refresh again.

**Alternative considered**: Exponential backoff with 3 retries. Rejected as overkill for a user-initiated action.

### Decision 3: Close stale client before reconnect, don't mutate in place

**Rationale**: The old `MCPClient` has dead pipes/sockets. Creating a fresh `MCPClient` and calling `connect()` gives a clean state. The old client's `close()` is a no-op if already dead, but safe to call.

### Decision 4: Reconnect only if status is "connected" or "error", not "disconnected"

**Rationale**: "Disconnected" means the user explicitly disconnected — we shouldn't auto-reconnect. "Connected" means we think it's alive (but it isn't). "Error" means a previous attempt failed and the server might be back.

## Risks / Trade-offs

- **[Risk] Reconnection stalls UI feedback**: If the server takes 30s to timeout on connect, the user waits 30s to see error state.
  → **Mitigation**: `MCPClient.connect()` already has a configurable timeout (`connectTimeoutMs`). The existing timeout mechanism handles this.

- **[Risk] Race condition**: User clicks Refresh, reconnect starts async, user clicks Refresh again before it finishes.
  → **Mitigation**: The second call's `registerDrivers` will find either the new connected client or the old dead one. The `closing` flag on MCPClient prevents double-close. Acceptable.

- **[Trade-off] Stale client removal might orphan in-flight tool calls**: If a tool call is in-flight on the old client when reconnect closes it, that call will fail with "client closed".
  → **Acceptable**: The server is already dead; the tool call was going to fail anyway. The reconnect gives a clean path forward.

## Migration Plan

No migration needed — this is a behavioral change within existing APIs.

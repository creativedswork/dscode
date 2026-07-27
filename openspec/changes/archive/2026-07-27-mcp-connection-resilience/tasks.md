## 1. Type System Changes

- [x] 1.1 Add `"disconnected"` event type to `MCPClientEvent` union in `src/mcp/types.ts`
- [x] 1.2 Add `"reconnecting"` status to `MCPServerStatus` type in `src/mcp/types.ts`
- [x] 1.3 Add `ErrorClass` type (`"transient"` | `"session_expired"` | `"permanent"`) in `src/mcp/types.ts`
- [x] 1.4 Run `npm run typecheck` to verify no breakage from new types

## 2. Bug Fixes in reconnectServer

- [x] 2.1 Fix variable shadowing in `reconnectServer()` catch block: remove inner `const state` (line 377 in `src/mcp/manager.ts`) so `state.toolCount = 0` targets the correct outer `state`
- [x] 2.2 Fix infinite recursion: replace `await this.reconnectServer(name)` (line 381) with `this.scheduleReconnect(name, 0)` stub — just set state to `"error"` for now until scheduleReconnect is implemented in task 5
- [x] 2.3 Verify: `npm run typecheck`

## 3. Error Classification Utility

- [x] 3.1 Add `classifyError(err: Error, transport: MCPTransport, statusCode?: number): ErrorClass` function in `src/mcp/manager.ts`
- [x] 3.2 Map error patterns: ECONNREFUSED/ETIMEDOUT → transient, HTTP 502/503/504 → transient, HTTP 401/403 → permanent, HTTP 404/410 without session header → session_expired, process exit → transient, invalid config → permanent
- [x] 3.3 Update `reconnectServer()` to use `classifyError()` in its catch block instead of the generic `state.status === "connected" || state.status === "error"` guard
- [x] 3.4 Verify: `npm run typecheck`

## 4. MCPClient Disconnection Events

- [x] 4.1 Emit `"disconnected"` event from `connectStdio()` process `"exit"` handler when `closing === false`
- [x] 4.2 Emit `"disconnected"` event from `connectStdio()` process `"error"` handler when `closing === false`
- [x] 4.3 Emit `"disconnected"` event from `connectLegacySSE()` `res.on("end")` handler when `!this.closed`
- [x] 4.4 Update `connectLegacySSE()` `res.on("error")` to emit `"disconnected"` instead of just rejecting
- [x] 4.5 Add `emit()` helper method to `MCPClient` (already has `this.eventListeners` and `onEvent()`)
- [x] 4.6 Verify `closing` flag is correctly set in `close()` before connection teardown (guard against false "disconnected" events)
- [x] 4.7 Verify: `npm run typecheck`

## 5. MCPManager Auto-Reconnect Scheduling

- [x] 5.1 Add `scheduleReconnect(name: string, attempt: number)` method to `MCPManager`
- [x] 5.2 Implement exponential backoff: `delay = Math.min(30000, 1000 * Math.pow(2, attempt)) + Math.random() * 500`
- [x] 5.3 Guard: skip reconnect if `state.status === "disconnected"` (user explicitly disconnected)
- [x] 5.4 Guard: skip if `attempt >= 10` — set state to `"error"` and stop
- [x] 5.5 On success: state → `"connected"`, register tools, emit `"tools_refreshed"` event
- [x] 5.6 On transient failure: `scheduleReconnect(name, attempt + 1)`
- [x] 5.7 On session_expired failure: `scheduleReconnect(name, 0)` (reset counter)
- [x] 5.8 On permanent failure: state → `"error"`, stop
- [x] 5.9 Update `handleClientEvent()` to call `scheduleReconnect(name, 0)` on `"disconnected"` events
- [x] 5.10 Update `disconnectServer()` to cancel any pending reconnect timer (store timer refs)
- [x] 5.11 Update `shutdown()` to cancel all pending reconnect timers
- [x] 5.12 Verify: `npm run typecheck`

## 6. Streamable HTTP Session Recovery

- [x] 6.1 Extract `handleHttpResponse(response, entry)` from `sendHttpMessage` callback in `MCPClient.request()` for clarity
- [x] 6.2 In `sendHttpMessage`, detect 404 or 410 responses without `Mcp-Session-Id` header
- [x] 6.3 If session expired: call `connectStreamableHttp()` to re-initialize, store new `sessionId`
- [x] 6.4 Retry the original HTTP request once with new session ID — if success, return result
- [x] 6.5 If retry also fails with 404/410: emit `"disconnected"` event and reject
- [x] 6.6 If re-initialize itself fails: emit `"disconnected"` and reject
- [x] 6.7 Handle session rotation: update `this.sessionId` when any response includes a new `Mcp-Session-Id`
- [x] 6.8 Verify: `npm run typecheck`

## 7. Open Design Daemon Restart

- [x] 7.1 In `src/core/main.ts`, update the `odChild.on("exit")` handler to restart daemon when exit code is non-zero and `withOd` is true
- [x] 7.2 Call `startOdDaemon(odDir, odPort)` to spawn new daemon process
- [x] 7.3 Call `registerOdCleanup(newChild)` to register cleanup for the new process
- [x] 7.4 Call `waitForOdDaemon(odPort)` to wait for the new daemon to become healthy
- [x] 7.5 Log restart event via `harnessLogger.info("ODDaemon", ...)`
- [x] 7.6 Guard against restart loops: track consecutive restart count, give up after 3 rapid restarts (< 5s apart)
- [x] 7.7 Verify: `npm run typecheck`

## 8. Integration Validation

- [x] 8.1 Verify `reconnectServer()` is called from `registerDrivers()` (existing) and from `scheduleReconnect()` (new) — both paths reachable
- [x] 8.2 Verify MCP state changes are pushed to WebSocket clients after auto-reconnect (existing `pushMcpState` pattern)
- [x] 8.3 Verify `disconnectServer()` properly cleans up reconnect timers
- [x] 8.4 Verify `shutdown()` properly cancels all pending reconnects
- [x] 8.5 Verify no regression: tools registered before disconnect are re-registered after reconnect
- [x] 8.6 Run full `npm run typecheck && npm test`

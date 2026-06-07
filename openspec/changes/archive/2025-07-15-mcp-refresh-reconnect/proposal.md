## Why

When an MCP server process is restarted (closed and reopened), clicking "Refresh" in the web UI does not reconnect — it only marks the server as "error". Users must manually disconnect then reconnect each server individually. The "Refresh" action should restore connectivity when the server is reachable again.

## What Changes

- **`MCPManager.registerDrivers()`**: When `listTools()` fails on an existing client, instead of just setting error state, attempt to reconnect: close the dead client → create a new one → connect → list tools → register driver. If reconnection also fails, then set the error state as before.
- **`MCPManager.connectServer()`**: Remove the early-return guard when a stale client exists but the underlying connection is dead. Allow reconnection for servers whose client is in a failed state.
- Reconnection is async and non-blocking — it runs in the background without blocking the WebSocket message loop or TUI thread.

## Capabilities

### New Capabilities
- `mcp-reconnect-on-refresh`: When a user-initiated refresh detects a dead MCP connection, the system attempts to transparently reconnect before reporting failure.

### Modified Capabilities
- `mcp-state-push`: After a successful reconnection during refresh, the updated MCP state (with `"connected"` status and refreshed tool list) SHALL be broadcast to all WebSocket clients, consistent with the existing state-push behavior.

## Impact

- `src/mcp/manager.ts` — `registerDrivers()` method (primary change)
- `src/mcp/manager.ts` — `connectServer()` method (guard removal)
- `src/ui/web/web-backend.ts` — `handleMcp()` refresh path (may need minor adjustment to handle cascade)
- `src/ui/mcp-browser.ts` — TUI refresh path (indirect; uses same `registerDrivers`)

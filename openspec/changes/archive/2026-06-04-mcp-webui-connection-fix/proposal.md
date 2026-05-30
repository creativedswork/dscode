## Why

When `cwd/.dscode/settings.json` has MCP servers configured, the Web UI sidebar shows them but their status is stale or "disconnected". Users must manually click Refresh to see actual connection state. The root cause is two-fold: (1) MCP initialization completes **after** the WebSocket server starts, so early "list" requests get empty/error state with no follow-up push, and (2) there is no per-server connect/disconnect control in the UI — only a global Refresh button.

## What Changes

- **Auto-push MCP state after initialization**: After `MCPManager.initialize()` + `registerDrivers()` completes, broadcast `mcp_state` to all connected WebSocket clients so the sidebar reflects real connection status without manual refresh.
- **Push MCP state on WS connect if MCP is ready**: When a new WebSocket client connects and MCP is already initialized, include or immediately follow with `mcp_state`.
- **Per-server connect/disconnect in MCPManager**: Add `connectServer(name)` and `disconnectServer(name)` methods to `MCPManager`, wrapping existing `MCPClient.connect()` / `MCPClient.close()`, and properly managing driver registration/unregistration.
- **Per-server connect/disconnect UI**: Add Connect and Disconnect buttons to each MCP server entry in the Web UI sidebar, with corresponding `ClientCommand` actions (`mcp` with `connect` / `disconnect`) and server-side handling.
- **Push MCP state on any connection status change**: When a server connects, disconnects, or errors, push updated `mcp_state` to all WS clients.

## Capabilities

### New Capabilities
- `mcp-state-push`: Real-time MCP state synchronization from server to Web UI clients via WebSocket push

### Modified Capabilities
- `websocket-protocol`: Add `mcp` command actions `connect` and `disconnect`; add requirement that `mcp_state` is pushed on MCP initialization completion and on any connection state change
- `web-frontend`: McpPanel gains per-server Connect/Disconnect buttons; McpServerInfo props extended with `onConnect` / `onDisconnect` callbacks

## Impact

- **`src/core/harness.ts`**: After MCP init + registerDrivers, call new `pushMcpState()` method on WebUiBackend
- **`src/mcp/manager.ts`**: New `connectServer()`, `disconnectServer()` methods; state management for per-server lifecycle
- **`src/ui/web/web-backend.ts`**: `setMcpManager` now pushes initial `mcp_state`; new `pushMcpState` helper; handle `connect`/`disconnect` mcp actions
- **`src/ui/shared/types.ts`**: `ClientCommand` mcp action union extended with `"connect" | "disconnect"` + optional `serverName`
- **`web/src/components/Sidebar.tsx`**: McpPanel per-server connect/disconnect buttons; new `onMcpServerAction` prop
- **`web/src/components/App.tsx`**: Wire up new connect/disconnect actions

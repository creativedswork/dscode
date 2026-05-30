## 1. Protocol & Type Extensions

- [x] 1.1 Extend `ClientCommand` in `src/ui/shared/types.ts`: add `"connect"` and `"disconnect"` to mcp action union, with optional `serverName` field
- [x] 1.2 Verify `ServerEvent.mcp_state` type uses `McpServerInfo[]` from shared module (already correct)

## 2. MCPManager: Per-Server Connect/Disconnect

- [x] 2.1 Add `connectServer(name: string): Promise<void>` to `MCPManager` — creates `MCPClient`, calls `connect()`, `listTools()`, registers driver, updates state to `"connected"` or `"error"`
- [x] 2.2 Add `disconnectServer(name: string): Promise<void>` to `MCPManager` — calls `client.close()`, removes from `clients` map, unregisters driver from `DriverRegistry`, updates state to `"disconnected"`
- [x] 2.3 Add `DriverRegistry.unregister(name: string)` method if not already present
- [x] 2.4 Handle edge cases: connect on already-connected server (no-op), disconnect on already-disconnected server (no-op), disconnect during shutdown

## 3. WebUiBackend: State Push & Connect/Disconnect Handling

- [x] 3.1 Add `pushMcpState()` method to `UiBackend` interface as optional (`pushMcpState?(): void`)
- [x] 3.2 Implement `pushMcpState()` in `WebUiBackend` — calls `buildMcpServers()` and broadcasts `mcp_state` to all connected WS clients
- [x] 3.3 Update `WebUiBackend.setMcpManager()` to call `pushMcpState()` if MCP is already initialized (not just store the reference)
- [x] 3.4 In `handleMcp()`, add `"connect"` and `"disconnect"` action handlers that call `mcpManager.connectServer()` / `disconnectServer()` then `pushMcpState()`
- [x] 3.5 In `WebUiBackend.handleConnect()`, after sending `ready` event, if `mcpManager` is initialized, call `pushMcpState()`

## 4. Harness: Call pushMcpState After MCP Init

- [x] 4.1 In `harness.run()`, after `mcpManager.initialize()` + `mcpManager.registerDrivers()` completes (lines 525-527), call `this.ui.pushMcpState?.()` to broadcast initial state
- [x] 4.2 Verify that `TuiBackend` does not need `pushMcpState` implementation (already handled via lazy `getMcpServers()`)

## 5. Web UI: Connect/Disconnect Buttons

- [x] 5.1 Update `SidebarProps` to accept `onMcpServerAction: (action: "connect" | "disconnect", serverName: string) => void`
- [x] 5.2 In `McpPanel`, add per-server Connect/Disconnect button based on status:
  - `disconnected` / `error` → "Connect" button
  - `connected` / `connecting` → "Disconnect" button
- [x] 5.3 Wire `onMcpServerAction` through `App.tsx` → `send({ type: "mcp", action, serverName })`
- [x] 5.4 Style buttons using warm design system tokens (small secondary button, consistent with existing Refresh button)

## 6. TypeScript & Build Verification

- [x] 6.1 Run `npm run typecheck` — zero errors
- [x] 6.2 Run `npm run build:web` — builds successfully
- [x] 6.3 Verify shared types are re-exported correctly from `web/src/types/index.ts`

## 7. Manual Testing

- [ ] 7.1 Start `dscode --web` with MCP servers in `.dscode/settings.json` — verify sidebar shows `connected` status without manual Refresh
- [ ] 7.2 Click Disconnect on a connected server — verify status changes to `disconnected` and tools disappear
- [ ] 7.3 Click Connect on a disconnected server — verify status changes to `connected` and tools appear
- [ ] 7.4 Open a second browser tab — verify it also receives current MCP state automatically
- [ ] 7.5 Verify TUI mode still works (`dscode` without `--web`) — `/mcp` panel shows correct status

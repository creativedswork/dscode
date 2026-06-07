## 1. Core: Reconnect on refresh failure

- [x] 1.1 Add private `reconnectServer` method to `MCPManager` that: closes dead client, removes from map, creates new `MCPClient`, calls `connect()`, calls `listTools()`, calls `registerDriver()`, updates state
- [x] 1.2 In `registerDrivers()` catch block: when `listTools()` fails and server status is `"connected"` or `"error"`, call `reconnectServer()` instead of just setting error state
- [x] 1.3 If `reconnectServer()` also fails, set state to `"error"` with the reconnection error message

## 2. Core: Allow connect on error-state servers

- [x] 2.1 Modify `connectServer()` guard: instead of `if (existing) return`, check if `existing` and server status is not `"error"`. If status is `"error"`, close the stale client first, then proceed with fresh connection
- [x] 2.2 Ensure `connectServer()` still returns early for `"connected"` and `"connecting"` states

## 3. Web backend: Ensure state push after reconnect

- [x] 3.1 Verify `handleMcp("refresh")` calls `pushMcpState()` after `registerDrivers()` completes, so reconnected state is broadcast. Ensure this happens in both success and failure paths
- [x] 3.2 Test that `handleMcp("refresh")` does not block the WebSocket message handler (already fire-and-forget in `handleMessage`)

## 4. Tests

- [x] 4.1 Add unit test: `registerDrivers` reconnects when `listTools()` fails on a client with `"connected"` status
- [x] 4.2 Add unit test: `registerDrivers` does not reconnect when server status is `"disconnected"`
- [x] 4.3 Add unit test: `connectServer` allows reconnection when server is in `"error"` state
- [x] 4.4 Add unit test: `connectServer` still skips when server is `"connected"` or `"connecting"`

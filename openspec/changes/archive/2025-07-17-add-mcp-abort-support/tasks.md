## 1. MCPClient.request abort support

- [x] 1.1 Add optional `signal?: AbortSignal` parameter to `MCPClient.request()` method
- [x] 1.2 Add early-exit: if `signal?.aborted` is true before making any request, reject immediately with `AbortError`
- [x] 1.3 Wire abort listener for stdio transport: on abort, remove pending entry, reject with `AbortError`, and send `notifications/cancelled` to server
- [x] 1.4 Track `http.ClientRequest` objects for streamable-http transport; on abort, call `req.destroy()`
- [x] 1.5 Track `http.ClientRequest` objects for SSE POST transport; on abort, call `req.destroy()`
- [x] 1.6 Clean up abort listener when request completes normally (all transports)

## 2. MCPClient public API surface

- [x] 2.1 Add optional `signal?: AbortSignal` to `callTool(name, args, signal?)` and forward to `request()`
- [x] 2.2 Add optional `signal?: AbortSignal` to `readResource(uri, signal?)` and forward to `request()`

## 3. MCPManager buildAgentTool wiring

- [x] 3.1 Rename `_signal` to `signal` in `buildAgentTool()` execute function
- [x] 3.2 Pass `signal` to `client.callTool(def.name, args, signal)`
- [x] 3.3 Catch `AbortError` in the try/catch and return user-friendly message: `"Tool call aborted by user."` with `details.error: true`

## 4. Validation

- [x] 4.1 Run `npm run typecheck` and fix any type errors
- [x] 4.2 Run `npm test` and ensure existing tests pass
- [ ] 4.3 Manual test: start an MCP server with a slow tool, press Ctrl+C / Stop during execution, verify the tool call is cancelled immediately (not after timeout)

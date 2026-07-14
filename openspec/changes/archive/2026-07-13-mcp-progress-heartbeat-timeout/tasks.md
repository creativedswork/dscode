## 1. PendingEntry type changes

- [x] 1.1 Add `timeoutMs: number` field to `PendingEntry` type in `src/mcp/client.ts`
- [x] 1.2 Add `cleanup: () => void` field to `PendingEntry` type — encapsulates existing cleanup closure from `request()`

## 2. Core request timeout refactor

- [x] 2.1 In `request()`, store `timeoutMs: timeout` on the `PendingEntry` object (already receiving `timeout` as a parameter)
- [x] 2.2 In `request()`, store the existing `cleanup` closure on `PendingEntry.cleanup` so it's accessible outside the promise constructor
- [x] 2.3 Extract timer creation in `request()` into a helper to avoid duplication with `resetTimeout` — or ensure the timeout callback logic is identical between the two

## 3. resetTimeout implementation

- [x] 3.1 Add private `resetTimeout(id: string | number)` method to `MCPClient`
- [x] 3.2 Method SHALL call `clearTimeout(entry.timer)` on the existing timer
- [x] 3.3 Method SHALL call `entry.cleanup()` to remove abort event listeners from the OLD timer context
- [x] 3.4 Method SHALL create a new `setTimeout` with the original `entry.timeoutMs`
- [x] 3.5 New timer callback SHALL mirror existing timeout logic: `this.pending.delete(id)`, `entry.cleanup()`, `notifications/cancelled`, `entry.reject(...)`

## 4. Progress heartbeat hook

- [x] 4.1 In `handleNotification`, add `this.resetTimeout(pp.progressToken)` call in the `"notifications/progress"` case, BEFORE the `this.emit(...)` call

## 5. Configurable timeout for tool calls

- [x] 5.1 Change `callTool` timeout param from `TOOL_CALL_TIMEOUT` to `this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT`
- [x] 5.2 Change `readResource` timeout param from `TOOL_CALL_TIMEOUT` to `this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT`

## 6. Default timeout bump

- [x] 6.1 Change `TOOL_CALL_TIMEOUT` from `60_000` to `120_000`

## 7. Validation

- [x] 7.1 Run `npm run typecheck` and fix any type errors
- [x] 7.2 Run existing MCP-related tests: `npm test -- --grep mcp` (if any exist)
- [x] 7.3 Manual smoke test: trigger a long-running MCP tool with progress, verify it survives past 60s

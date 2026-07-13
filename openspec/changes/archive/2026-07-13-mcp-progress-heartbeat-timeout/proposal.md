## Why

MCP tool calls currently have a hardcoded 60-second timeout (`TOOL_CALL_TIMEOUT`) that kills the request regardless of whether the server is actively sending progress. With `mcp-tool-progress-inline` now surfacing progress to the UI, users can see a tool actively working — only to have it killed at the 60s mark while progress was still flowing. A fixed timeout (whether 60s or 300s) is fundamentally a guess; the right behavior is: as long as the server is communicating, keep the connection alive.

## What Changes

- **New** `requestTimeoutMs` field on `PendingEntry` in `MCPClient` — remembers the timeout duration per-request for heartbeat resets
- **New** `resetTimeout(id)` private method on `MCPClient` — clears and restarts the inactivity timer with the original duration
- **Modified** `handleNotification("notifications/progress")` — calls `resetTimeout` to extend the deadline every time progress arrives
- **Modified** `callTool` and `readResource` — use `this.config.requestTimeoutMs ?? TOOL_CALL_TIMEOUT` instead of hardcoded `TOOL_CALL_TIMEOUT`, respecting per-server configuration
- **Modified** `TOOL_CALL_TIMEOUT` — bumped from 60s to 120s as the inactivity tolerance (not total time limit); with heartbeat resets, the total execution time is unbounded as long as progress keeps flowing
- **No breaking changes** — `MCPServerConfig.requestTimeoutMs` already exists, now actually honored for tool calls

## Capabilities

### New Capabilities
- `mcp-progress-timeout-heartbeat`: MCP tool call timeout resets on every `notifications/progress` from the server, turning the timeout into an inactivity guard rather than a hard execution limit. Users can configure `requestTimeoutMs` per MCP server for fine-grained control.

### Modified Capabilities
<!-- None — existing spec requirements are unchanged. The timeout reset is an additive behavior that doesn't alter any existing contract. -->

## Impact

- `src/mcp/client.ts` — `PendingEntry` type, `request()` timeout creation, `handleNotification` for progress, `callTool`/`readResource` timeout param
- `src/mcp/types.ts` — no changes (types already support `requestTimeoutMs`)
- `src/core/harness.ts` — no changes (progress events already flow through)
- `src/ui/web/web-backend.ts` — no changes
- User config `~/.dscode/settings.json` — existing `requestTimeoutMs` field now works for tool calls

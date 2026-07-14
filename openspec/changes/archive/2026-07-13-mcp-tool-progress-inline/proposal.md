## Why

MCP servers emit `notifications/progress` during long-running tool executions, but dscode's WebUI currently has no wire protocol event for progress, no progress field on `ToolCallEntry`, and no progress UI in `ToolCard`. Intermediate progress data is simply discarded at the `MCPManager` layer. Users see a static tool card with a spinner and get results only at `tool_end` — with no visibility into what's happening during execution.

This change surfaces MCP progress to the WebUI, embedded inline within the `ToolCard` component itself (not as a separate dialog or overlay), and extends the visual language to include a progress bar in both collapsed and expanded states.

## What Changes

- **New** `tool_progress` event in the `ServerEvent` wire protocol, carrying `name`, `progress`, `total` (optional), and `message` (optional)
- **New** `progress`, `progressTotal`, `progressMessage` fields on `ToolCallEntry`
- **New** progress bar UI in `ToolCard`: full bar in expanded body, mini bar on collapsed header
- **New** indeterminate progress animation for cases where `total` is unknown
- **New** `MCPManager` subscribes to client `progress` notifications and forwards them to the harness event bus
- **New** `WebUiBackend` subscribes to the harness progress event and broadcasts `tool_progress` to WebSocket clients
- **New** ToolCard auto-expands on first `tool_progress` to show the progress bar
- **New** progress bar fades out 600ms after `tool_end` (completion)
- **Modified** `conversationReducer` handles `tool_progress` to update in-progress tool entries
- **Modified** ToolCard header shows `◌` (spinner) during progress, transitions to `✓` on completion
- **New** Execution Card — nested card in ToolCard body for in-progress MCP tools, with status label, progress bar, and elapsed time
- **New** ToolCard auto-expands on `tool_start` for MCP tools (in addition to first-progress auto-expand)
- **New** elapsed time display in progress section (`Date.now() - toolStartTime`)
- `mcp-execution-card`: Nested Execution Card inside MCP ToolCards during tool execution, displaying status label, progress bar, and elapsed time as a unified execution context
- **New** waiting state: when in-progress MCP tool has no progress data, show status label + elapsed time (no empty body)
## Capabilities

### New Capabilities
- `mcp-tool-progress-inline`: End-to-end surfacing of MCP tool progress notifications from server to WebUI, rendered inline within the ToolCard component with a progress bar, mini header bar, and indeterminate state

### Modified Capabilities
- `websocket-protocol`: New `tool_progress` ServerEvent type with `name`, `progress`, `total?`, `message?` fields
- `web-frontend`: ToolCard gains progress bar rendering, auto-expand on progress, collapse-with-mini-bar, and completion fade-out
- `tool-result-content-rendering`: ToolCallEntry type extended with progress fields; reducer handles `tool_progress` to mutate in-progress entries

## Impact

- `src/mcp/types.ts` — already has `MCPProgressNotificationParams` (no change needed)
- `src/mcp/client.ts` — already emits `progress` events (no change needed)
- `src/mcp/manager.ts` — new subscription to client `progress` events, forwarding to harness
- `src/core/types.ts` — potential new harness event type for progress (or reuse existing channel)
- `src/ui/web/web-backend.ts` — new harness event subscription + `tool_progress` broadcast
- `src/ui/shared/types.ts` — `ToolCallEntry` and `ServerEvent` type extensions
- `src/ui/shared/reducer.ts` — new `tool_progress` case
- `web/src/components/ToolCard.tsx` — progress bar UI, mini bar, auto-expand logic, fade-out
- `web/src/index.css` — progress bar styles + indeterminate keyframe animation

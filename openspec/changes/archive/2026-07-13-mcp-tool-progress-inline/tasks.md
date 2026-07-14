## 1. Type definitions

- [x] 1.1 Add `progress?: number`, `progressTotal?: number`, `progressMessage?: string` to `ToolCallEntry` in `src/ui/shared/types.ts`
- [x] 1.2 Add `tool_progress` event type to `ServerEvent` union in `src/ui/shared/types.ts`

## 2. Harness event bus

- [x] 2.1 Add `mcp:tool:progress` event type to harness event map in `src/core/events.ts`
- [x] 2.2 Subscribe to MCP client `progress` events in `MCPManager` (`src/mcp/manager.ts`) and emit `mcp:tool:progress` harness event

## 3. WebSocket bridge

- [x] 3.1 Subscribe to `mcp:tool:progress` harness event in `WebUiBackend` (`src/ui/web/web-backend.ts`)
- [x] 3.2 Broadcast `tool_progress` ServerEvent to all connected WebSocket clients from the handler

## 4. Reducer

- [x] 4.1 Add `tool_progress` case to `conversationReducer` in `src/ui/shared/reducer.ts` — find last streaming assistant message, locate matching `ToolCallEntry` by name where result is empty, update `progress`/`progressTotal`/`progressMessage`
- [x] 4.2 Add `"tool_progress"` to event handler fall-through group in `web/src/components/App.tsx` `handleEvent` switch-case alongside `"tool_start"`, `"tool_end"`, `"mcp_app"` — without this, the WebSocket event is silently dropped and never reaches the reducer

## 5. ToolCard UI — progress bar

- [x] 5.1 Add progress bar rendering in expanded body: track + fill divs, percentage text, message text below, wrapped in a container above rich list/raw block
- [x] 5.2 Add indeterminate progress bar mode: CSS class with `@keyframes` animation for sliding 30%-width block
- [x] 5.3 Add mini progress bar in collapsed header: 2px × ~72px bar between args and arrow, with percentage text
- [x] 5.4 Add progress bar fade-out on completion: CSS transition `opacity 600ms ease` on class toggle, then `display: none`

## 6. ToolCard UI — auto-expand

- [x] 6.1 Add `userManuallyCollapsed` state ref to ToolCard
- [x] 6.2 Auto-expand (`setOpen(true)`) when tool transitions from no-progress to has-progress
- [x] 6.3 Set `userManuallyCollapsed = true` on manual collapse; suppress re-expand on subsequent progress

## 7. ToolCard UI — status icon

- [x] 7.1 Add CSS rotation animation (`@keyframes spin`) for `◌` spinner
- [x] 7.2 Apply spinner class when `progress` is present and `result` is empty
- [x] 7.3 Switch to `✓` when `result` is non-empty and `isError` is false

## 8. CSS styles

- [x] 8.1 Add progress bar styles to `web/src/index.css`: `.progress-bar`, `.progress-fill`, `.progress-text`, `.progress-message`
- [x] 8.2 Add mini bar styles: `.mini-progress-bar`, `.mini-progress-fill`, `.mini-progress-text`
- [x] 8.3 Add indeterminate `@keyframes` animation for progress bar fill
- [x] 8.4 Add fade-out transition class `.progress-fade-out`
- [x] 8.5 Add header spinner animation `@keyframes spin`

## 9. Validation

- [x] 9.1 Run `npm run typecheck` and fix any type errors
- [ ] 9.2 Manual smoke test: start `npm start -- --web`, trigger an MCP tool that emits progress, verify progress bar appears inline in ToolCard
- [x] 9.3 Verify dark theme: toggle theme, confirm progress bar colors adapt correctly
- [x] 9.4 Verify indeterminate state: trigger a progress event without `total`, confirm animated indeterminate bar
- [x] 9.5 Verify auto-expand + manual collapse: confirm auto-expand on first progress, confirm manual collapse prevents re-expand

## 10. Cleanup — remove redundant toast popup

- [x] 10.1 Remove `ui:info` toast emission from `handleMcpEvent("progress")` in `src/core/harness.ts` (lines 1113-1117). The `mcp:tool:progress` harness event (lines 1120-1127) already delivers progress through the inline ToolCard channel. The toast was the pre-change mechanism and now competes with the inline progress bar, making users think progress only appears in the popup.

## 11. Execution Card — nested card for in-progress MCP tools

- [x] 11.1 Add Execution Card rendering in ToolCard body: nested `.exec-card` with status label (pulsing dot + "Live · executing" / "Live · waiting"), progress section, and elapsed time — shown when `isMcp && !hasResult`
- [x] 11.2 Add waiting state: when no `progress` field exists, show status label + elapsed time only, no progress bar
- [x] 11.3 Add Execution Card CSS styles to `web/src/index.css`: `.exec-card`, `.exec-card-label`, `.exec-card-status`, pulsing dot animation
- [x] 11.4 Add auto-expand for MCP tools on first render: set `open = true` when `isMcp && !hasResult` (once, respect `userManuallyCollapsed`)
- [x] 11.5 Add elapsed time display in progress section: start timer on `tool_start`, display formatted elapsed time alongside progress

## 12. Validation — Execution Card

- [x] 12.1 Verify in-progress MCP tool body is never empty — always shows Execution Card or progress bar
- [x] 12.2 Verify waiting state shows status label + elapsed time when no progress
- [x] 12.3 Verify MCP ToolCards auto-expand on tool start
- [x] 12.4 Verify manual collapse still prevents re-expand for MCP tools
- [x] 12.5 Verify dark theme: Execution Card colors adapt correctly


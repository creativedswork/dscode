## Why

Users currently have zero visibility into how much of the model's context window is consumed by message history (system prompt, user messages, tool calls, etc.). This leads to blind spots: users don't know when they're approaching the context limit, which tool types dominate usage, or why the agent starts forgetting earlier context. In the Cline/Roo Code ecosystem, the context window bar is a beloved UX pattern that builds user trust by making the token budget transparent. We should bring the same clarity to dscode's WebUI.

## What Changes

- Add a real-time **context window usage bar** in the center area of the WebUI title bar header
- The bar visualizes the context window as a horizontal segmented bar with per-category color coding (system prompt, user messages, file reads, file edits, terminal commands, browser use, free space)
- A new `context_window` server-to-client WS event pushes token breakdown data to the frontend
- The `ContextManager` is extended to track and expose per-category token estimates
- The bar updates live as messages and tool calls accumulate during a session

## Capabilities

### New Capabilities

- `context-window-bar`: A real-time horizontal segmented bar in the WebUI header showing context window usage broken down by message/tool category with per-category colors, free space indicator, and numerical token count display.

### Modified Capabilities

- `websocket-protocol`: New `context_window` server event type added to `ServerEvent` union for pushing token breakdown data.
- `web-frontend`: Header layout modified to render the context window bar in the center region; new requirement for the bar component's styling and behavior.

## Impact

- **Backend**: `ContextManager` in `src/context/manager.ts` — add per-category estimation; `WebUiBackend` in `src/ui/web/web-backend.ts` — broadcast `context_window` events on message/tool activity
- **Shared types**: `ServerEvent` union in `src/ui/shared/types.ts` — new `context_window` event type
- **Frontend**: New `ContextWindowBar` component in `web/src/components/`; `App.tsx` header layout — render the bar in center
- **Design tokens**: New CSS custom properties for category bar colors in `web/src/index.css`

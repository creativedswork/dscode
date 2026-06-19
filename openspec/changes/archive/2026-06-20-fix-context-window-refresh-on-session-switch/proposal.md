## Why

When a user loads a saved session in the Web UI, the context window bar in the header continues to display stale data from the previous session. This is because the session load code path bypasses the event bus and never emits a `context_window` event after restoring the loaded messages — leaving the frontend with the old token breakdown until a new tool call or turn end naturally triggers a refresh.

## What Changes

- In the Web backend's `handleSession` → `load` handler, call `broadcastContextWindow(true)` after the session is fully loaded and `ready` event has been sent, so the frontend receives fresh context window data reflecting the loaded session's messages.

## Capabilities

### New Capabilities

None — this is a bug fix.

### Modified Capabilities

- `context-window-bar`: The existing context window bar now correctly refreshes on session load, closing the gap where the `context_window` event was missing from the session load code path.

## Impact

- **Backend**: `src/ui/web/web-backend.ts` — one additional `broadcastContextWindow(true)` call in the session `load` handler (approximately line 1038, after the `ready` event is sent).

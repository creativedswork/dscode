## Why

When a user deletes the currently active session from the sidebar, the main conversation UI does not reset — old messages remain visible and the ChatView stays in "conversation mode" instead of returning to the welcome page. This creates a confusing state where users see messages from a session that no longer exists.

## What Changes

- **SessionManager**: `deleteSession()` clears `this.current` when the deleted session ID matches the currently active session
- **WebUiBackend**: subscribes to `session:deleted` event and broadcasts updated session list to all connected clients (parity with `session:saved` / `session:created`)
- **WebUiBackend.handleSession delete**: when the deleted session is the current session, sends `clear_conversation` event so the frontend ChatView resets to the welcome state
- **WebUiBackend.handleSession delete**: includes `currentSessionId` in the response so the frontend can update sidebar active highlight correctly

## Capabilities

### New Capabilities
- `session-delete-current-reset`: When the current session is deleted from the sidebar, the main conversation UI resets to the welcome page and the sidebar clears its active session highlight

### Modified Capabilities
- `session-management`: `SessionManager.deleteSession()` must clear `this.current` when deleting the active session; `WebUiBackend` must detect and respond to current-session deletion
- `session-list-live-sync`: `session:deleted` event must push updated session list to all connected clients (currently only `session:saved` and `session:created` do this)

## Impact

- `src/session/manager.ts` — `deleteSession()` method: add `this.current = null` guard
- `src/ui/web/web-backend.ts` — event subscriptions: add `session:deleted` handler; `handleSession` delete case: add `clear_conversation` and `currentSessionId` to response
- `web/src/components/App.tsx` — `sessions` event handler already handles `currentSessionId: null` (sets to `null`), no change needed
- `web/src/components/ChatView.tsx` — already handles `messages.length === 0` case (shows welcome page), no change needed

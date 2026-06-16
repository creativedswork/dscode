## Why

The session list in the sidebar currently only updates at discrete boundary points (page load, message send, agent completion). During a running agent turn, the session metadata (message count, preview, title) is stale — it doesn't reflect the ongoing conversation. Additionally, the active running session's delete button is not guarded by `isProcessing`, allowing a user to delete the session mid-flight and corrupt the agent state.

## What Changes

- **Push session list at end of each assistant turn** — `finishAssistantMessage()` (called after every thinking→tools→text cycle) broadcasts the updated session list to all connected clients, so message counts and metadata stay live
- **Block deletion of the active session during processing** — extend the existing `isDisabled` guard on session rows to also apply to the active session's delete button when `isProcessing` is true, preventing mid-flight deletion
- **Push session list on user message send** — already done as a prerequisite; the `chat` case now calls `pushSessionList` immediately after the `user_message` event, before the agent begins

## Capabilities

### New Capabilities

- `session-list-live-sync`: The sidebar session list SHALL update in real-time as the agent runs, not only at discrete boundary points. Metadata (message count, title, preview) SHALL reflect the current state after each assistant turn completes.

### Modified Capabilities

- `web-frontend`: Session row delete button SHALL be disabled for ALL sessions (including the active one) when `processing` is true, not just for non-active sessions.

## Impact

- **Server**: `web-backend.ts` — `finishAssistantMessage()` gains a `pushSessionList` broadcast
- **Client**: `Sidebar.tsx` — `SessionsPanel` delete button guard widened from `isDisabled` to `isProcessing || isDisabled` (or equivalent)
- No API changes, no breaking changes

## Context

The session list in the sidebar is currently a "pull" model: `pushSessionList()` is called at discrete lifeycle points (connect, message send, agent completion, session CRUD). During an agent run that spans multiple turns (thinking → tools → text cycles), the session's `messageCount`, title, and preview remain frozen until the agent fully completes and `pushSessionList` fires in the `chat` case's finally block.

The `UiBackend` interface already has a `finishAssistantMessage()` callback that fires at the end of every assistant turn. This is the natural hook point for pushing fresh session metadata to the sidebar — each turn adds an assistant message, changing `messageCount` and potentially the preview/title.

The delete button for session rows uses `isDisabled` (`isProcessing && !isActive`) as its guard. This correctly blocks deletion of non-active sessions during processing, but the ACTIVE session's delete button remains clickable because `isDisabled` is `false` when `isActive` is true. A user could delete the running session mid-flight, corrupting agent state.

## Goals / Non-Goals

**Goals:**
- Session list updates in real-time: metadata refreshes after each assistant turn completes
- Delete button on the active running session is blocked during processing

**Non-Goals:**
- Sub-turn updates (mid-thinking, mid-tool-execution) — too frequent, no value
- Per-client push differentiation — broadcast to all clients is sufficient
- Multi-session parallel processing support (only one session runs at a time currently)

## Decisions

### Decision 1: Hook `finishAssistantMessage()` for live sync

**Choice**: Call `pushSessionList` from `finishAssistantMessage()` using broadcast.

**Rationale**: `finishAssistantMessage()` is already invoked by the harness at the end of every assistant turn (thinking→tools→text). It signals "the assistant just produced a complete message," which is exactly when session metadata becomes stale and should refresh. Broadcasting (via `WsServer.broadcast`) ensures all connected clients see the update, not just the client that triggered the prompt.

**Alternatives considered**:
- Hook into `setProcessing(true)` → too early; session hasn't changed yet
- Hook into `saveSessionNow()` → not called during streaming, only at the end
- Add a new harness callback → unnecessary complexity; the existing interface suffices

### Decision 2: Broadcast session list, not per-client

**Choice**: Use `this.wsServer.broadcast(event)` rather than targeting `this.currentClient`.

**Rationale**: Multiple clients may be connected (different browser tabs). All should see the session list update. `pushSessionList` currently targets a specific client via `client.send()`, but `finishAssistantMessage()` has no client reference. Broadcasting is simpler and correct — it's what `addUserMessage`, `textDelta`, etc. already do.

### Decision 3: Guard delete with `isProcessing`, not `isDisabled`

**Choice**: Change the delete button's onClick guard from `!isDisabled` to `!isDisabled && !isProcessing`.

**Rationale**: `isDisabled` covers non-active sessions. The missing case is the active session during processing. Rather than adding a separate condition only for the active case, guard all deletes with `!isProcessing` — during processing, no session can be deleted. This is the safest, simplest rule.

**Alternatives considered**:
- Guard only the active session's delete: `!isDisabled && !(isActive && isProcessing)` → more complex, same effect since `isDisabled` already covers non-active
- Allow delete and clear the conversation view → risky, the agent is still writing to that session

## Risks / Trade-offs

- **Risk**: `finishAssistantMessage` fires frequently (every turn). Broadcasting the full session list each time creates some WebSocket traffic → **Mitigation**: The session list payload is small (<50 sessions, <5KB). The `sessionsEqual` check on the frontend prevents unnecessary re-renders.
- **Risk**: `finishAssistantMessage` is called from the harness, not the web backend. If the harness doesn't call it during certain code paths (e.g., errors), the session list won't update → **Mitigation**: The existing `pushSessionList` calls at completion boundaries remain as fallbacks. If `finishAssistantMessage` is skipped, the list still updates at the end.

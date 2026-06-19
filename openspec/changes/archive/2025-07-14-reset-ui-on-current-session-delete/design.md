## Context

The session lifecycle currently has three event-driven push paths: `session:created` → broadcast session list, `session:saved` → broadcast session list, and `turn:end` → broadcast session list. The `session:deleted` event is emitted by `SessionManager.deleteSession()` but has no listener in `WebUiBackend`. Furthermore, `deleteSession()` removes the file from disk but retains `this.current` even when the deleted session is the active one, leaving the manager in an inconsistent state.

The delete handler in `WebUiBackend.handleSession` sends an updated session list to the requesting client only (not broadcast) and does not include `currentSessionId` in the response. When the deleted session is the current one, no `clear_conversation` event is sent, so the frontend retains stale messages.

## Goals / Non-Goals

**Goals:**
- When the current session is deleted via sidebar, the ChatView resets to the welcome page
- The sidebar correctly reflects the absence of an active session
- Session list updates after deletion are broadcast to all connected clients
- `SessionManager` internal state stays consistent with disk state

**Non-Goals:**
- Changing the behavior when a non-current session is deleted (already works correctly)
- Adding an "undo delete" mechanism
- Auto-switching to the most recent remaining session after delete — simply reset to welcome page
- Changing the TUI behavior (TUI session handling is separate from Web UI)

## Decisions

### Decision 1: Clear `this.current` in `SessionManager.deleteSession()`

**Choice:** In `deleteSession()`, add `if (id === this.current?.id) this.current = null` before emitting the event.

**Rationale:** The manager owns the current session state; it is the authoritative source. Letting the caller (WebUiBackend) clear it would be fragile and violate encapsulation. This mirrors how `loadSession()` sets `this.current` — the manager manages its own invariants.

**Alternatives considered:**
- Clear in WebUiBackend after calling deleteSession: layering violation, easy to miss in other callers
- Don't clear, rely on null check in getCurrentSessionId(): leaves stale reference hanging

### Decision 2: Check current session BEFORE deletion in WebUiBackend

**Choice:** In `handleSession` delete case, capture `const wasCurrent = sessionManager.getCurrentSessionId() === cmd.id` before calling `deleteSession()`, then conditionally send `clear_conversation`.

**Rationale:** After Decision 1 is applied, `getCurrentSessionId()` returns `null` post-deletion, so we must capture the "was this current" state beforehand. This is a simple boolean check with no side effects.

### Decision 3: Broadcast session list on `session:deleted` event

**Choice:** Subscribe to `session:deleted` in WebUiBackend constructor, calling `pushSessionListToAll()` — identical to existing `session:saved` and `session:created` handlers.

**Rationale:** Parity with other session lifecycle events. Ensures all clients see the updated list, not just the delete initiator. The event payload includes the deleted session's ID, but the handler doesn't need it — `pushSessionListToAll()` reads fresh state from `sessionManager.listSessions()`.

### Decision 4: Include `currentSessionId` in delete response

**Choice:** The delete case already sends `sessions` data. Add `currentSessionId: sessionManager.getCurrentSessionId()` to the response. After Decision 1, this will be `null` when the current session was deleted, which causes the frontend to clear sidebar highlight via the existing `setCurrentSessionId(event.currentSessionId ?? null)` handler.

**Rationale:** Minimal change; the frontend handler already supports null currentSessionId. No frontend code changes needed.

## Risks / Trade-offs

- **Risk:** If `session:deleted` event handler is added but someone later adds a different delete path that doesn't emit the event → session list won't update. **Mitigation:** All delete paths go through `SessionManager.deleteSession()` which always emits the event.
- **Risk:** Race condition if two clients delete sessions simultaneously — each gets correct list for their state. **Mitigation:** Store operations are synchronous file I/O; second delete returns "not found" error. Acceptable.
- **Trade-off:** Not auto-switching to the most-recent remaining session may feel less "smart," but avoids surprising the user with unexpected context loads. Welcome page is a safe default.

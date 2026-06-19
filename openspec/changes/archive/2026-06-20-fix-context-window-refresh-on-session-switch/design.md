## Context

The `context-window-usage-bar` change (in-progress) added a `ContextWindowBar` component to the Web UI header and a `broadcastContextWindow()` method in `WebUiBackend` that pushes `context_window` events over WebSocket. The bar refreshes whenever it receives a `context_window` event.

However, the session load code path (`handleSession` → `"load"` in `web-backend.ts`) never calls `broadcastContextWindow()`. After loading a session, the frontend receives `clear_conversation` and `ready` events, but no `context_window` event — so the bar continues showing the previous session's token breakdown.

The correct behavior is already demonstrated by the `ui:conversation:clear` event handler (line 160), which calls both `broadcast({ type: "clear_conversation" })` and `broadcastContextWindow(true)`. The session load handler does the equivalent of `clear_conversation` directly via `client.send()` but omits the corresponding `broadcastContextWindow` call.

## Goals / Non-Goals

**Goals:**
- Ensure the `ContextWindowBar` immediately reflects the loaded session's token usage after session switch

**Non-Goals:**
- Change the throttling mechanism for `context_window` events
- Change how token counting or category breakdown works
- Modify the frontend component or its data flow

## Decisions

**Decision: Call `broadcastContextWindow(true)` after sending `ready` in the session load handler**

- **Rationale**: The `ready` event already pushes the loaded session's messages to the frontend — the context window breakdown should be derived from those exact messages, so it makes sense to compute and broadcast it immediately after `ready`. Using `true` for `bypassThrottle` ensures the update is sent immediately without the 500ms throttle delay.
- **Alternatives considered**:
  1. *Add `context_window` data to the `ready` event type* — Would require changing the shared `ServerEvent` type and the frontend handler. More invasive than needed; the existing `context_window` event channel already works.
  2. *Broadcast after `clear_conversation` instead of `ready`* — `clear_conversation` is sent before `ready`, so the frontend wouldn't yet have the messages to make sense of the context window data.
  3. *Trigger via event bus (`ui:conversation:clear`) instead of direct send* — Would require restructuring the session load handler to go through the event bus rather than directly sending events. Higher risk of unintended side effects.

## Risks / Trade-offs

- **Risk: Double broadcast** — If another event (e.g., a tool callback) triggers `broadcastContextWindow` between the session load calls, the frontend might receive two context_window updates in quick succession. → **Mitigation**: The throttle mechanism limits redundant broadcasts to one per 500ms window. The `bypassThrottle` flag is only used once at session load time, so at most one extra broadcast occurs.
- **Risk: Empty breakdown** — If the loaded session has zero messages, `getContextWindow()` might return 0 and the broadcast will be skipped (line 1187: `if (cw <= 0) return`). → **Acceptable**: The bar is hidden when there's no data (per existing spec), which is the correct state for an empty session.

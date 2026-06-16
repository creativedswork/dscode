## Context

The `SessionsPanel` in `Sidebar.tsx` renders session list items with click handlers that trigger `onAction("load", sid)`. Each item computes an `isDisabled` flag: `isProcessing && !isActive`. This correctly disables non-active sessions during processing, but leaves the active session clickable — a click on it sends a `session load` command that the server interprets as a session switch/reset, destroying the in-progress conversation.

## Goals / Non-Goals

**Goals:**
- Prevent clicking the active session from triggering a `session load` while `isProcessing` is true — the click should be a no-op.
- Keep the active session visually normal (clickable appearance, no opacity reduction) during processing.

**Non-Goals:**
- No changes to the server-side session load behavior.
- No changes to the Stop/Abort mechanism.
- No changes to the `isDisabled` logic — non-active sessions remain visually disabled during processing.

## Decisions

**Decision: Add a guard in the onClick handler, not change `isDisabled`**

Instead of modifying `isDisabled` (which would visually gray out the active session), add a no-op guard directly in the `onClick` handler:

```tsx
onClick={() => { if (isActive && isProcessing) return; if (!isDisabled) onAction("load", s.id); }}
```

This preserves the existing visual behavior — the active session stays highlighted and looks clickable — but the click does nothing. Non-active sessions continue to use the existing `isDisabled` check.

Alternative considered: Change `isDisabled` to `isProcessing`. Rejected because the user wants the active session to remain visually normal (not grayed out) during processing.

## Risks / Trade-offs

- [Risk] Users might be confused that clicking the active session does nothing during processing → Mitigation: The session already shows a spinner indicator during processing, providing a visual cue that it's busy. The Stop button is the clear affordance for interruption.

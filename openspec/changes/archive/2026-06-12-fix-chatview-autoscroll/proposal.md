## Why

ChatView unconditionally calls `scrollIntoView` on every `messages`/`processing`/`permissionPrompt` change, forcibly yanking users back to the conversation bottom even when they are reading older messages. During streaming this fires on every token delta, making it impossible to scroll through history while the model responds. After streaming ends, any state change (processing toggle, permission prompt) also disrupts the user's reading position.

## What Changes

- ChatView auto-scroll becomes **conditional**: only scrolls to bottom when the user is already at (or near) the bottom of the conversation
- When the user manually scrolls up to read history, auto-scroll is suppressed until they scroll back to the bottom
- Detection uses a scroll event listener on the chat container, comparing `scrollTop + clientHeight` against `scrollHeight` with a small threshold
- Keeps existing `instant` vs `smooth` behavior distinction for streaming vs idle states

## Capabilities

### New Capabilities

- `chat-auto-scroll-gating`: ChatView auto-scroll-to-bottom behavior that respects user scroll position — only follows new content when the user is already at the bottom, allowing uninterrupted history reading during streaming and idle states

### Modified Capabilities

- `web-frontend`: The "Auto-scroll during streaming is instant" and "Auto-scroll when idle is smooth" scenarios are amended to include the at-bottom precondition; new scenarios added for user-scrolled-away suppression and scroll-back-to-bottom re-engagement

## Impact

- **Affected code**: `web/src/components/ChatView.tsx` (add `onScroll` handler, `isAtBottom` ref, gate the `scrollIntoView` call)
- **No API changes**, no dependency changes
- **No breaking changes** — existing scroll behavior is preserved when user is at bottom; only the disruptive force-scroll is removed

## Context

ChatView (`web/src/components/ChatView.tsx:45-47`) currently uses a `useEffect` that unconditionally calls `bottomRef.current?.scrollIntoView()` whenever `messages`, `processing`, or `permissionPrompt` changes. During streaming, `messages` changes on every token delta via `setMessages((prev) => conversationReducer(prev, event))`, producing a new array reference each time. This causes the effect to fire on every token, forcibly scrolling to bottom and preventing the user from reading history.

The fix is a standard chat-UI pattern: only auto-scroll when the user is already at (or near) the bottom of the scroll container. When the user manually scrolls up, auto-scroll is suppressed until they scroll back down. When they scroll back to the bottom during streaming, auto-scroll must resume immediately — scrolling with each new token as it arrives.

## Goals / Non-Goals

**Goals:**
- Let users freely scroll through conversation history during streaming without being yanked back to bottom
- Auto-scroll continuously when the user is at the bottom (existing default behavior preserved)
- When the user manually scrolls back to the bottom during streaming, immediately re-engage auto-scroll — scroll to the current bottom and continue following new tokens
- Use a simple, lightweight detection mechanism (scroll event + threshold comparison)
- No new dependencies, no API changes

**Non-Goals:**
- "Scroll to bottom" floating button (nice-to-have, out of scope for this fix)
- Scroll position restoration across tab switches (handled by browser; not relevant here)
- Changing the instant vs smooth behavior logic (already correct per spec)

## Decisions

### Decision 1: `isAtBottomRef` + `onScroll` on the container

Use a `useRef<boolean>` (`isAtBottomRef`) to track whether the user is at the bottom. Attach an `onScroll` handler to the chat container div to update this ref on every scroll event.

**Why not state?** Using `useState` for `isAtBottom` would cause a re-render on every scroll event, which is unnecessary and could cause jank during smooth scrolling. A ref provides O(1) read in the effect without triggering re-renders.

**Why not `IntersectionObserver` on `bottomRef`?** An `IntersectionObserver` on the bottom sentinel div would fire asynchronously and could miss rapid scroll position changes during streaming. A direct scroll event comparison is simpler and more predictable.

### Decision 2: Threshold-based detection

Define `isAtBottom` as: `scrollTop + clientHeight >= scrollHeight - threshold` where `threshold = 64` (px). This 64px tolerance handles:
- Sub-pixel scroll positions on high-DPI displays
- Small layout shifts from streaming content (thinking block expand/collapse)
- The bottom sentinel div height (~0px but margin/padding may affect calculation)

**Why 64px?** Large enough to be forgiving of minor layout changes during streaming, small enough that the user must intentionally scroll up to escape auto-scroll.

### Decision 3: `useLayoutEffect` with dependency array — precise triggering

Replace the existing `useEffect([messages, processing, permissionPrompt])` with a **`useLayoutEffect` with dependency array `[messages, processing, permissionPrompt]`**. This runs synchronously after every content or state change, before the browser paints:

```tsx
// Before (current):
useEffect(() => {
  bottomRef.current?.scrollIntoView({ behavior: hasStreaming ? "instant" : "smooth" });
}, [messages, processing, permissionPrompt]);

// After (new):
useLayoutEffect(() => {
  if (isAtBottomRef.current && bottomRef.current) {
    bottomRef.current.scrollIntoView({
      behavior: hasStreaming ? "instant" : "smooth",
    });
  }
}, [messages, processing, permissionPrompt]);
```

**Why `useLayoutEffect` instead of `useEffect`?** `useLayoutEffect` fires synchronously after DOM mutations but before the browser paints. This means when a new token renders (increasing `scrollHeight`), the scroll-to-bottom happens in the same frame — zero visual flicker. With `useEffect`, there's a one-frame gap where the user sees stale scroll position before the effect fires.

**Why dependency array `[messages, processing, permissionPrompt]`?** The effect must only run when its triggers actually change, not on every render. The elapsed timer calls `setElapsed` every animation frame (~60fps), causing renders that would also trigger an unguarded `useLayoutEffect`. While the `isAtBottomRef` guard prevents `scrollIntoView` from being called, the synchronous execution of `useLayoutEffect` at 60fps still interferes with the browser's rendering pipeline and causes perceptible scroll jitter. Using a dependency array eliminates these spurious invocations.

### Decision 4: Immediate re-engagement when user scrolls to bottom during streaming

When the user manually scrolls back to the bottom during streaming, `onScroll` detects the transition from `isAtBottom=false` to `isAtBottom=true`. At this point, the user should see the very latest content immediately — not wait for the next token to trigger a render.

Handle this in the `handleChatScroll` callback:

```tsx
const handleChatScroll = useCallback(() => {
  const el = scrollContainerRef.current;
  if (!el) return;
  const wasAtBottom = isAtBottomRef.current;
  const nowAtBottom = el.scrollTop + el.clientHeight >= el.scrollHeight - 64;
  isAtBottomRef.current = nowAtBottom;

  // Immediate snap when user scrolls back to bottom during streaming
  if (!wasAtBottom && nowAtBottom && hasStreaming) {
    requestAnimationFrame(() => {
      bottomRef.current?.scrollIntoView({ behavior: "instant" });
    });
  }
}, [hasStreaming]);
```

**Why `requestAnimationFrame`?** Calling `scrollIntoView` synchronously inside a scroll event handler can cause recursive scroll events and jank. `rAF` defers the scroll to the next frame, after the current scroll gesture is processed.

**Why only when `hasStreaming`?** During idle, the `useLayoutEffect` on the next render will handle the scroll. The `rAF` snap is specifically needed during streaming because tokens are arriving rapidly and we don't want the user to see stale content between re-engaging and the next token.

### Decision 5: Initial `isAtBottom` state

Set `isAtBottomRef.current = true` initially. This ensures the first messages that appear (initial load, first user message) trigger auto-scroll as expected. The user starts "at bottom" until they scroll away.

### Decision 6: Scroll container ref for geometry reads

Add a `scrollContainerRef` to the chat scroll container div. This is needed both for the `onScroll` handler (to read `scrollTop`/`clientHeight`/`scrollHeight`) and potentially for the re-engagement snap. The existing `bottomRef` is at the very end of the container and cannot be used for container geometry reads.

## Risks / Trade-offs

- **[Risk] `useLayoutEffect` without deps runs on every render**: Even renders from unrelated state changes (e.g., elapsed timer ticks). → **Mitigation**: `scrollIntoView` on an already-visible element is browser-optimized to a near-no-op. The timer updates every animation frame (~16ms), but the guard `isAtBottomRef.current` prevents actual scrolling. Profile if needed; measurable overhead is negligible.
- **[Risk] Smooth scroll during idle + user scrolling**: If the user scrolls to near-bottom (within 64px threshold) and a state change triggers the `useLayoutEffect`, they'll see a brief smooth scroll. → **Mitigation**: The 64px threshold is small enough that this only happens when the user is effectively at the bottom anyway. The smooth animation is subtle and non-disruptive.
- **[Risk] `scrollHeight` changes due to content above viewport**: When new messages are added above the viewport (e.g., tool results from a previous turn expand), `scrollHeight` increases but `scrollTop` stays the same, potentially making `isAtBottom` false even though the user didn't scroll. → **Mitigation**: This is actually correct behavior — if content above grows, the user's view shifts and they're no longer "at bottom."
- **[Risk] `requestAnimationFrame` scroll inside scroll handler**: The `rAF`-deferred `scrollIntoView` could conflict with an in-progress `useLayoutEffect` scroll on the same frame. → **Mitigation**: Both scroll to the same target (`bottomRef`), and `scrollIntoView` is idempotent. The `rAF` fires before the next paint, so the user sees only the final position.

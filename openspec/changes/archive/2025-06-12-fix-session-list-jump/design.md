## Context

The web UI's session list sidebar (`SessionsPanel` inside `Sidebar.tsx`) displays saved conversation sessions in a scrollable container. The server (`web-backend.ts`) pushes the full session list to the frontend via a `sessions` WebSocket event after every chat turn completion (line 394), after save/delete operations, and after project path changes.

On the frontend (`App.tsx`), each `sessions` event triggers `setSessions(event.data)`, replacing the entire `sessions` state array. This causes React to re-render the `SessionsPanel` with a completely new array reference. The scroll container (`div.flex-1.overflow-y-auto`) is a parent of the session list — but when its content is replaced by React reconciliation, the browser resets `scrollTop` to 0, causing the list to jump to the top.

This makes it impossible to scroll through and view session history, especially during active use when sessions are frequently updated.

## Goals / Non-Goals

**Goals:**
- Preserve the session list's scroll position across all data updates, including after chat turn completions
- Prevent the "jump to top" behavior that makes session history inaccessible
- Keep the solution minimal and focused — no over-engineering

**Non-Goals:**
- Redesigning the session list UI or layout
- Changing how the server sends session data (server optimization is optional and out of scope)
- Virtual scrolling or infinite scroll (unnecessary for <50 items)
- Changing the session data model

## Decisions

### Decision 1: Preserve scroll position via `useRef` + `useLayoutEffect`

**Approach**: Save the scroll container's `scrollTop` before state updates and restore it synchronously after React commits the DOM changes.

- Add a `scrollContainerRef` to the scrollable `<div>` in Sidebar
- Before `setSessions`, save `scrollTop` in a ref
- After render, use `useLayoutEffect` (synchronous, before paint) to restore `scrollTop`
- Use a "scroll restoration key" derived from session IDs to detect when the list structure changes enough to warrant a natural scroll reset (e.g., tab switch)

**Why not useEffect?** `useEffect` runs asynchronously after paint, which can cause a visible flash of the list at the top. `useLayoutEffect` runs synchronously after DOM mutations but before paint, so the scroll position is restored without any visible jump.

**Why not React.memo?** `React.memo` only prevents re-renders when props are referentially equal. Since the server sends a new array, props will never be referentially equal. We need a content-based comparison.

### Decision 2: Content-based comparison before state update

**Approach**: In the `sessions` event handler, compare the incoming data with the current `sessions` state before calling `setSessions`. Use a shallow comparison of `id`, `updatedAt`, and `messageCount` for each session.

```
function sessionsEqual(a: SessionInfo[], b: SessionInfo[]): boolean {
  if (a.length !== b.length) return false;
  return a.every((s, i) =>
    s.id === b[i].id &&
    s.updatedAt === b[i].updatedAt &&
    s.messageCount === b[i].messageCount
  );
}
```

**Why this approach**: Prevents no-op re-renders that still disrupt scroll position. If nothing changed, don't touch the state at all.

### Decision 3: Stable scroll container identity

**Approach**: Ensure the scroll container DOM node is never unmounted while the sessions tab is active. The current `className="flex-1 overflow-y-auto p-3"` div already satisfies this — it's always rendered regardless of which tab is active. The conditional rendering is inside it (`{activeTab === "sessions" && ...}`), not on the container itself.

**No changes needed** for this — verified that the scroll container is stable.

## Risks / Trade-offs

- **Risk**: `useLayoutEffect` restoration could conflict with browser's own scroll restoration → **Mitigation**: Only restore when we explicitly saved; use a flag to distinguish programmatic vs. user scroll
- **Risk**: Comparison function could miss legitimate updates → **Mitigation**: Only compare structural fields (id, updatedAt, messageCount), not the full session object; title changes would still trigger update since they affect updatedAt
- **Trade-off**: Adds a small amount of runtime comparison overhead → negligible for <50 items

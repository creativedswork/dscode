## 1. Scroll Preservation in Sidebar

- [x] 1.1 Add `scrollContainerRef` to the scrollable `<div>` in `Sidebar.tsx` content area
- [x] 1.2 Add `savedScrollTopRef` to track scroll position across re-renders
- [x] 1.3 Save `scrollTop` from `scrollContainerRef` before React commits a re-render triggered by sessions data change
- [x] 1.4 Use `useLayoutEffect` to restore `scrollTop` synchronously after DOM commit, preventing visible jump
- [x] 1.5 Skip scroll restoration when the user has switched tabs (natural reset on tab change)

## 2. Sessions State Deduplication

- [x] 2.1 Add `sessionsEqual()` comparison function in `App.tsx` (or a shared utility) that compares `id`, `updatedAt`, and `messageCount` fields
- [x] 2.2 In the `sessions` event handler, call `sessionsEqual()` before `setSessions()` — only update state if data actually changed
- [x] 2.3 Use functional state update (`setSessions(prev => ...)`) to access current state for comparison

## 3. Verification

- [ ] 3.1 Manually test: open sidebar sessions tab, scroll to middle of list, send a chat message, verify scroll position is preserved after the response completes
- [ ] 3.2 Manually test: save a session via `/session save`, verify scroll position is preserved
- [ ] 3.3 Manually test: delete a session, verify scroll position adjusts naturally without jumping to top
- [ ] 3.4 Manually test: switch to MCP tab and back to sessions, verify scroll resets to top (fresh view)
- [x] 3.5 Run `npm run typecheck` to verify no TypeScript errors

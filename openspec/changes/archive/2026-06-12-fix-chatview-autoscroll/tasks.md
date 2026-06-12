## 1. Add scroll tracking to ChatView

- [x] 1.1 Add `isAtBottomRef` (initialized `true`) and `scrollContainerRef` to ChatView
- [x] 1.2 Add `useCallback` `handleChatScroll` that updates `isAtBottomRef` using `scrollTop + clientHeight >= scrollHeight - 64`, and on false→true transition during streaming triggers `requestAnimationFrame(() => scrollIntoView({ behavior: "instant" }))`
- [x] 1.3 Add `ref={scrollContainerRef}` and `onScroll={handleChatScroll}` to the chat scroll container div

## 2. Replace scroll effect with useLayoutEffect

- [x] 2.1 Remove the existing `useEffect([messages, processing, permissionPrompt])` that calls `scrollIntoView` unconditionally
- [x] 2.2 Add a `useLayoutEffect` with no dependency array that calls `scrollIntoView({ behavior: hasStreaming ? "instant" : "smooth" })` only when `isAtBottomRef.current` is true

## 3. Verification

- [ ] 3.1 Verify: during streaming, scrolling up to read history is not interrupted by auto-scroll
- [ ] 3.2 Verify: remaining at bottom during streaming continues to auto-scroll normally
- [ ] 3.3 Verify: scrolling back to bottom during streaming immediately snaps to the latest content and resumes following new tokens
- [ ] 3.4 Verify: processing state changes and permission prompts do not yank scroll when user is away from bottom

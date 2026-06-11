## 1. Fix ChatView scroll container

- [x] 1.1 Add `min-h-0` to ChatView root div className to fix flexbox overflow clipping

## 2. Fix auto-scroll behavior during streaming

- [x] 2.1 Conditionally use `behavior: "instant"` vs `"smooth"` in the `scrollIntoView` useEffect based on `hasStreaming` prop

## 3. Verify

- [x] 3.1 Build the web frontend (`npm run build:web`) and confirm no TypeScript errors
- [ ] 3.2 Manually test with a large `write_file` tool call result — confirm scrolling reaches the bottom and the message input is visible

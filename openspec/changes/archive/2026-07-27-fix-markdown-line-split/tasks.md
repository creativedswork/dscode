## 1. Markdown.tsx — DOM post-processing for collider spans

- [x] 1.1 Add `isStreaming` prop to Markdown component interface (optional boolean, defaults to false)
- [x] 1.2 Import `useRef` and `useLayoutEffect` from React
- [x] 1.3 Add `ref` to the container `<div>` element
- [x] 1.4 Implement `useLayoutEffect` that:
  - Returns early if `isStreaming` is true (skip collider injection during streaming)
  - Queries the container div for all `<pre>` elements and wraps each code line in `<span data-collider="code-line">`
  - Queries for block-level elements (`<p>`, `<li>`, `<blockquote>`, `<th>`, `<td>`, `<h1>`–`<h4>`) and wraps text lines in `<span data-collider="text-line">`
  - Depends on `children` and `isStreaming` to re-run on content change
- [x] 1.5 Ensure injected spans have zero visual impact (no padding, margin, display changes)

## 2. ChatView.tsx — Remove per-line Markdown wrapping

- [x] 2.1 `AssistantMessage`: Replace `content.split('\n').map(...)` block with single `<Markdown isStreaming={message.isStreaming}>{safeContent}</Markdown>`
- [x] 2.2 `UserBubble`: Replace `content.split('\n').map(...)` block with single `<Markdown>{safeContent}</Markdown>` (user messages are never streaming)
- [x] 2.3 Remove the `<br />` empty-line fallback from both components (Markdown handles blank lines via paragraph spacing)
- [x] 2.4 Verify the empty-content pulse animation still renders when `isStreaming` is true and content is empty

## 3. Verification

- [x] 3.1 Run `npm run typecheck` and fix any TypeScript errors
- [x] 3.2 Run `npm run build` to verify the build succeeds
- [ ] 3.3 Manual test: send a message that produces a fenced code block, verify it renders as a single `<pre>` block
- [ ] 3.4 Manual test: send a message that produces a multi-item list, verify items render under one `<ul>`/`<ol>`
- [ ] 3.5 Manual test: trigger the Chat → Dashboard transition, verify cascade animation still works (collider spans present in DOM)
- [ ] 3.6 Manual test: observe streaming response, verify content renders correctly during streaming and collider spans appear when streaming ends

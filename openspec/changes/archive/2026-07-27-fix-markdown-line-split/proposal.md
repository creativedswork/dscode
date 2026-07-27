## Why

`ChatView.tsx` splits assistant and user message content by `\n` and wraps each line in a separate `<Markdown>` component. This prevents adjacent lines from seeing each other, destroying all multi-line Markdown constructs: fenced code blocks, lists, tables, and blockquotes. The `data-collider="text-line"` animation targets must be preserved, but the implementation needs to move from per-line Markdown renders to a single render with DOM-level post-processing.

## What Changes

- **ChatView.tsx** (`AssistantMessage` and `UserBubble`): Remove `content.split('\n')` — render entire content with a single `<Markdown>` call
- **Markdown.tsx**: Add DOM post-processing logic (via `ref` + `useEffect`) that wraps text lines inside paragraph-level elements (`<p>`, `<li>`, `<blockquote>`, `<th>`, `<td>`, headings) with `<span data-collider="text-line">` elements, and code block lines with `<span data-collider="code-line">`
- No changes to `TransitionCanvas` — it already queries `[data-collider]` from the DOM at animation time, so the spans will be found regardless of how they were created

## Capabilities

### New Capabilities

- `markdown-line-colliders`: Markdown component handles line-level `data-collider` span injection internally via DOM post-processing, preserving all multi-line Markdown structures while maintaining TransitionCanvas animation targets

### Modified Capabilities

- `web-frontend`: The `data-collider` DOM attribute requirement's **text-line marking** scenario changes — text lines are no longer wrapped in separate `<Markdown>` renders in ChatView; instead, Markdown.tsx post-processes a single render to inject spans. The **code-line marking** scenario is also refined — code line spans are injected during the single `<pre>` render pass rather than after split.

## Impact

- `web/src/components/ChatView.tsx` — `AssistantMessage` (line ~447) and `UserBubble` (line ~359): remove `split('\n')` per-line Markdown wrapping
- `web/src/components/Markdown.tsx` — add `ref` + `useEffect` DOM post-processing to inject `data-collider` spans
- No API, backend, or CSS changes

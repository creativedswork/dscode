## Context

Currently `ChatView.tsx` (`AssistantMessage` line 447, `UserBubble` line 359) splits message content by `\n`:
```jsx
safeContent.split('\n').map((line, i) => (
  <span key={i} data-collider="text-line">
    {line ? <Markdown>{line}</Markdown> : <br />}
  </span>
))
```

Each line gets its own `<Markdown>` instance, which means adjacent lines are parsed in isolation. The opening fence of a code block (` ```python`) has no idea the closing fence (` ``` `) exists three lines later. This destroys fenced code blocks, multi-item lists, tables, and blockquotes.

The `data-collider="text-line"` spans are required by `TransitionCanvas` for its cascade deconstruction animation. It queries `[data-collider]` from the live DOM at animation time.

## Goals / Non-Goals

**Goals:**
- Render Markdown once for the entire message content, preserving all multi-line constructs
- Provide `data-collider="text-line"` and `data-collider="code-line"` spans as DOM targets for TransitionCanvas
- No visual change to message rendering (same layout, same styling)
- No change to TransitionCanvas behavior

**Non-Goals:**
- Changing the cascade animation or TransitionCanvas internals
- Adding new CSS classes or design tokens
- Modifying how streaming updates work (deltas still accumulate in state via reducer)

## Decisions

### Decision 1: DOM post-processing in Markdown.tsx (not ChatView.tsx)

**Chosen**: Use a `ref` on the Markdown container div, then in `useEffect` walk the rendered DOM and wrap text lines in `<span data-collider="text-line">` elements.

**Rationale**: This moves the line-wrapping responsibility to where the Markdown rendering lives. ChatView just renders `<Markdown>{content}</Markdown>` — simple and correct. The Markdown component knows its own DOM structure and can post-process it after React finishes rendering.

**Alternative considered**: Keep line-wrapping in ChatView but use a single Markdown render + DOM mutation. Rejected because it leaks Markdown internals into ChatView and creates coupling between the animation layer and the message component.

### Decision 2: Target block-level elements for line wrapping

**Chosen**: Walk the rendered HTML and only split text content inside block-level elements: `<p>`, `<li>`, `<blockquote>`, `<th>`, `<td>`, `<h1>`–`<h4>`. Leave inline elements untouched.

**Rationale**: These are the elements where multi-line text appears in Markdown output. Inline elements (like `<code>`, `<strong>`, `<em>`) are styling only and don't need line-level animation targets. For `<pre>` blocks, wrap code lines in `data-collider="code-line"` — this is already partially done in the current `<pre>` custom component.

### Decision 3: useLayoutEffect over useEffect

**Chosen**: Use `useLayoutEffect` for DOM post-processing.

**Rationale**: We need the spans to be in the DOM before the browser paints, so there's never a visible frame where text lines are missing their collider spans. `useLayoutEffect` runs synchronously after DOM mutations but before paint.

### Decision 4: Skip post-processing during streaming

**Chosen**: Only run the DOM post-processing when the message is NOT streaming (`isStreaming !== true`), or throttle it to run at most once per 500ms during streaming.

**Rationale**: During streaming, the content changes on every `text_delta` (potentially 30+ times per second). Walking the entire DOM on every update would be wasteful. The cascade animation only triggers on completed messages anyway — `TransitionCanvas` operates on messages that are already rendered. For streaming, we can either skip collider injection entirely or throttle it.

**Final**: Skip during streaming. `TransitionCanvas` only targets completed messages. Streaming messages don't need collider spans.

## Risks / Trade-offs

- **DOM mutation after React render**: React doesn't know about our manually inserted spans. If React re-renders the Markdown subtree, the spans are lost and recreated. Mitigation: the `useLayoutEffect` re-runs whenever `children` changes, re-injecting spans. This is acceptable because Markdown content is stable after streaming ends.

- **Streaming content flicker**: When streaming stops and the effect runs for the first time, there could be a one-frame layout shift. Mitigation: the `<span>` elements have no styling (inline, no padding/margin), so they don't affect layout.

- **Empty content edge case**: If content is empty string, the Markdown component renders nothing and the effect is a no-op — safe.

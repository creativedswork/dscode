## Context

`ChatView.tsx` renders assistant message bubbles with a content area that shows one of three states:

1. **Has content**: render `Markdown` component with `safeContent`
2. **No content, no thinking, not streaming**: render italic "(no content)" placeholder
3. **No content, but thinking or streaming**: render nothing (pulsing dot during streaming)

State 2 is the problem. When the assistant responds with only tool calls (common with MCP tools), there is no text content and no thinking — just tools. The "(no content)" placeholder becomes visible, misleading users.

## Goals / Non-Goals

**Goals:**
- Remove "(no content)" placeholder from assistant message bubbles
- When content is empty, render nothing in the content area

**Non-Goals:**
- Changing thinking block rendering
- Changing tool card rendering
- Changing streaming indicator behavior

## Decisions

**Decision: Remove the "(no content)" branch entirely, default to null.**

The current ternary:

```tsx
{safeContent || (message.images && message.images.length > 0) ? (
  <Markdown ...>{safeContent}</Markdown>
) : !message.thinking && !message.isStreaming ? (
  <span ...>(no content)</span>
) : null}
```

Becomes a simple conditional:

```tsx
{safeContent || (message.images && message.images.length > 0) ? (
  <Markdown ...>{safeContent}</Markdown>
) : (
  message.isStreaming && !message.thinking && (!message.images || message.images.length === 0) ? (
    <span className="inline-block w-2 h-4 animate-pulse rounded-sm" ... />
  ) : null
)}
```

This also collapses the separate pulsing-dot check (lines 331-333) into the same ternary, eliminating the redundant condition.

**Alternative considered:** Keep "(no content)" but only hide when tools exist. Rejected because "(no content)" is never useful — it only signals "something went wrong" when in reality nothing did. If the assistant sends an empty message, showing nothing is the correct behavior.

## Risks / Trade-offs

- **Risk**: During model errors, a genuinely empty assistant message might appear blank with no indication. → **Mitigation**: The `error` server event already displays a toast; an empty message bubble with tools is still informative.
- **Low risk**, minimal change surface (2 lines removed, condition simplified).

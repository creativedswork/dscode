## Context

ChatView is a flex child inside a column layout. Its parent chain:

```
App (h-screen flex flex-col)
  └─ Layout row (flex flex-1 overflow-hidden)
       └─ main (flex-1 flex flex-col min-w-0)
            ├─ ChatView (flex-1 overflow-y-auto)  ← bug here
            └─ MessageInput
```

CSS Flexbox specifies `min-height: auto` as the default for flex children (per the flexbox spec). This means a flex child cannot shrink below its intrinsic content height, even if `flex-basis` is smaller. When a large `write_file` result renders inside a MessageBubble, the ChatView's content height explodes, the `min-height: auto` prevents it from being constrained by the flex container, and it overflows the `overflow: hidden` parent — making the bottom unreachable.

## Goals / Non-Goals

**Goals:**
- ChatView must remain viewport-constrained regardless of content size
- Users must be able to scroll to the bottom of the conversation at all times
- Auto-scroll during streaming must not jank or freeze

**Non-Goals:**
- Changing the ToolCard's internal scroll (`max-h-40` already handles individual tool results)
- Changing the overall page layout structure
- Virtual scrolling or performance optimizations for very long conversations

## Decisions

### Decision 1: Add `min-h-0` to ChatView

**Chosen**: `min-h-0` Tailwind utility class on the ChatView root div.

**Rationale**: In Tailwind, `min-h-0` sets `min-height: 0`, overriding the flexbox default of `auto`. This is the standard fix for flex children that need to scroll. The pattern is already used for horizontal constraint via `min-w-0` on the sibling `main` element.

**Alternatives considered**:
- `h-0` — would work but breaks when ChatView would naturally be taller than 0. Less idiomatic.
- `overflow: hidden` on parent — would clip instead of scroll. Wrong behavior.
- Restructure to avoid nested flex — unnecessary refactor for a one-class fix.

### Decision 2: Use `behavior: "instant"` during streaming

**Chosen**: Conditionally use `behavior: "instant"` when `hasStreaming` is true, `"smooth"` otherwise.

**Rationale**: During streaming, `scrollIntoView` fires on every `messages` state change (every delta event). Smooth scroll animations take ~300ms; rapid updates cancel and restart them, causing visible jank. Instant scroll keeps the view anchored to the bottom during streaming and avoids animation conflicts.

**Alternatives considered**:
- Debouncing scroll calls — adds complexity, delay. Doesn't fix the core animation conflict.
- CSS `scroll-behavior: smooth` on container — same problem, all scrolls become smooth.
- Removing auto-scroll during streaming — breaks user expectation of following the content.

## Risks / Trade-offs

- **[Low] Instant scroll during streaming feels abrupt**: streaming content typically adds a few lines at a time, so the scroll distance is small. The trade-off of reliable scrolling over smooth animation is correct for streaming.
- **[None] min-h-0 side effects**: This is a standard CSS flexbox pattern. ChatView's `flex-1` already sets `flex-grow: 1` so it will still fill available space when content is short.

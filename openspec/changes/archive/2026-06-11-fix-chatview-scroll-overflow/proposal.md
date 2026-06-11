## Why

When a tool call (e.g., `write_file`) returns a large result, the ChatView flex item expands beyond the viewport due to CSS Flexbox's default `min-height: auto`, breaking scroll behavior. Users cannot scroll to the bottom of the conversation — the message input and the tail of the latest assistant bubble become permanently clipped behind the viewport edge. This makes large tool results (a common workflow) unusable.

## What Changes

- Add `min-h-0` to the ChatView scroll container to allow it to shrink below content height, letting `overflow-y-auto` correctly manage scrolling
- Change the auto-scroll behavior from `behavior: "smooth"` to `behavior: "instant"` during streaming to prevent smooth scroll animation cancellation jank

## Capabilities

### New Capabilities
<!-- None needed — this is a bug fix within existing capability scope -->

### Modified Capabilities
- `web-frontend`: The Conversation view scrolling requirement is tightened — the scroll container MUST use `min-h-0` in its flex layout context, and auto-scroll during streaming MUST use instant behavior to avoid animation conflict

## Impact

- `web/src/components/ChatView.tsx` — two inline changes: CSS class addition (`min-h-0`) and scroll behavior change
- No API, dependency, or system changes

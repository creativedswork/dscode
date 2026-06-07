## Why

When the assistant responds with only tool calls (e.g., MCP tool invocations) and no visible text content, the conversation view renders an italic "(no content)" placeholder. This confuses users who interpret it as a bug or error, when in fact the tool cards below contain the meaningful output. The "(no content)" fallback should be removed — if there is truly nothing to display, show nothing.

## What Changes

- Remove the "(no content)" italic fallback text from the assistant message bubble content area
- When an assistant message has no text content (but may have thinking and/or tools), the content area renders nothing instead of the misleading placeholder
- The `ThinkingBlock` and `ToolCard` components continue to render independently regardless of text content presence

## Capabilities

### New Capabilities

- `empty-assistant-content`: Assistant messages with no text content SHALL render nothing in the content area (instead of "(no content)" placeholder). The thinking block and tool cards remain unaffected.

### Modified Capabilities

- `web-frontend`: The "Conversation view" requirement's rendering behavior for assistant messages with empty content changes — the "(no content)" placeholder is removed.

## Impact

- `web/src/components/ChatView.tsx` — lines 324-328: the ternary branch that renders "(no content)" span
- No API changes, no dependency changes, no protocol changes

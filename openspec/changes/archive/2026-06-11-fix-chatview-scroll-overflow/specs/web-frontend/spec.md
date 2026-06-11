## MODIFIED Requirements

### Requirement: Conversation view
The frontend SHALL display a scrollable conversation area showing user messages, assistant responses with streaming text, thinking blocks with elapsed time indicators, and tool call results, all using the warm flat design system styling. Message state management SHALL use the shared `conversationReducer` from `@dscode/shared/reducer` instead of inline event handling logic. The elapsed time display SHALL be derived from `turnStartRef` (set by `handleSend` or `loader { state: "show" }`) rather than the `processing` state flag. When an assistant message has no text content, the content area SHALL render nothing instead of a "(no content)" placeholder. The conversation scroll container SHALL use `min-height: 0` (Tailwind `min-h-0`) to allow proper flexbox constraint and prevent overflow clipping of large content. Auto-scroll during streaming SHALL use `behavior: "instant"` to avoid smooth-scroll animation cancellation jank.

#### Scenario: User message display
- **WHEN** user submits a message
- **THEN** the message appears right-aligned with a warm amber accent background and warm white text, using `border-radius: 12px` bubble shape with subtle fade-up entrance animation (disabled under `prefers-reduced-motion`)

#### Scenario: Streaming assistant response
- **WHEN** the server sends `text_delta` events
- **THEN** the assistant message bubble updates incrementally via `conversationReducer`, using the warm surface background, `1px solid` border, and warm text colors

#### Scenario: Thinking block display with timer
- **WHEN** the server sends `thinking_delta` events
- **THEN** the thinking content appears in a collapsible `<details>` block (open during streaming) with muted warm styling and a subtle left border accent, and the summary shows `Thinking... (Xs)` where X is the elapsed seconds since `turnStartRef` was set by `handleSend`

#### Scenario: Tool call display
- **WHEN** the server sends `tool_start` and `tool_end` events
- **THEN** each tool call appears as an inline flat card with `border-radius: 8px`, `1px solid` warm border, tool name in monospace with amber accent, and muted pastel success/error indicators

#### Scenario: Empty assistant content renders nothing
- **WHEN** an assistant message has no text content (empty string), with or without thinking and tools
- **THEN** the message bubble content area renders nothing; no "(no content)" placeholder is displayed

#### Scenario: Large tool call result does not break scrolling
- **WHEN** a tool call (e.g., write_file) returns a result that is larger than the viewport height
- **THEN** the ChatView scroll container remains constrained to the viewport and the user can scroll to the bottom of the conversation to see all content, including the message input and the tail of the assistant bubble

#### Scenario: Auto-scroll during streaming is instant
- **WHEN** the conversation has a streaming message (hasStreaming is true)
- **THEN** auto-scroll to the bottom uses `scrollIntoView({ behavior: "instant" })` instead of smooth behavior

#### Scenario: Auto-scroll when idle is smooth
- **WHEN** the conversation has no streaming message (hasStreaming is false)
- **THEN** auto-scroll to the bottom uses `scrollIntoView({ behavior: "smooth" })` for a polished user experience

## ADDED Requirements

### Requirement: TransitionCanvas transparent overlay
The frontend SHALL include a `TransitionCanvas` component that renders a full-viewport transparent `<canvas>` overlay (z-index: 50, `background: transparent`, `pointer-events: none`) during the Chat → Dashboard transition. The Canvas SHALL draw only particles, the hop-step letter cluster, impact effects, and HUD labels — ChatView DOM provides all background and unstruck content.

#### Scenario: TransitionCanvas mounts during animation
- **WHEN** `transitionPhase` is `"animating"`
- **THEN** TransitionCanvas SHALL render a `<canvas>` element covering the full content area
- **AND** the Canvas SHALL have `background: transparent` and `pointer-events: none`
- **AND** ChatView SHALL remain mounted and visible beneath the Canvas

#### Scenario: TransitionCanvas unmounts on complete
- **WHEN** `transitionPhase` returns to `"idle"`
- **THEN** TransitionCanvas SHALL unmount
- **AND** the Canvas element SHALL be removed from the DOM

#### Scenario: Canvas DPR constraint
- **WHEN** TransitionCanvas initializes its Canvas context
- **THEN** the device pixel ratio SHALL be capped at `Math.min(window.devicePixelRatio, 2)`

### Requirement: data-collider DOM attributes
ChatView and its sub-components SHALL mark collidable elements with `data-collider` attributes to enable live DOM-based collision detection during the cascade transition animation.

#### Scenario: text-line marking
- **WHEN** Markdown.tsx renders a text paragraph
- **THEN** each visible line SHALL be wrapped in a `<span data-collider="text-line">` element with no additional styling or layout shift

#### Scenario: code-line marking
- **WHEN** Markdown.tsx renders a code block
- **THEN** each line SHALL have the attribute `data-collider="code-line"`

#### Scenario: tool-card marking
- **WHEN** ToolCard.tsx renders a tool call card
- **THEN** the card container SHALL have the attribute `data-collider="tool-card"`
- **AND** the tool header SHALL have the attribute `data-collider="tool-header"`
- **AND** tool result lines SHALL have the attribute `data-collider="tool-result-line"`

#### Scenario: message-card marking
- **WHEN** ChatView renders a user or assistant message bubble
- **THEN** the bubble container SHALL have the attribute `data-collider="message-card"`

### Requirement: CSS destruction animation keyframes
The frontend stylesheet SHALL include CSS `@keyframes` for text-line scatter and code-line corruption animations, triggered during the cascade transition by TransitionCanvas DOM manipulation.

#### Scenario: scatter keyframe available
- **WHEN** TransitionCanvas creates scatter-animated `<span>` elements inside a struck element
- **THEN** the scatter animation SHALL be a CSS keyframe that translates characters randomly within ±60px and fades opacity to 0 over 250ms

#### Scenario: code-corrupt keyframe available
- **WHEN** TransitionCanvas triggers code-line destruction
- **THEN** the corruption animation SHALL progressively replace characters with block glyphs and fade opacity to 0 over 400ms

### Requirement: Scroll container ref forwarding
ChatView SHALL expose a ref to its scroll container so TransitionCanvas can programmatically lock scrolling during animation.

#### Scenario: scrollContainerRef exposed
- **WHEN** `transitionPhase` is `"animating"` and ChatView renders
- **THEN** ChatView SHALL forward a `scrollContainerRef` (React ref to the scrollable DOM element) to TransitionCanvas
- **AND** TransitionCanvas SHALL use this ref to save/restore scroll position and set `overflow: hidden` during animation

## MODIFIED Requirements

### Requirement: Conversation view
The frontend SHALL display a scrollable conversation area showing user messages, assistant responses with streaming text, thinking blocks with elapsed time indicators, and tool call results, all using the warm flat design system styling. Message state management SHALL use the shared `conversationReducer` from `@dscode/shared/reducer` instead of inline event handling logic. The elapsed time display SHALL be derived from `turnStartRef` (set by `handleSend` or `loader { state: "show" }`) rather than the `processing` state flag. When an assistant message has no text content, the content area SHALL render nothing instead of a "(no content)" placeholder. The conversation scroll container SHALL use `min-height: 0` (Tailwind `min-h-0`) to allow proper flexbox constraint and prevent overflow clipping of large content. Auto-scroll to the bottom SHALL only occur when the user's scroll position is at or near the bottom of the container (within 64px threshold). When the user has manually scrolled away from the bottom, auto-scroll SHALL be suppressed until the user scrolls back to the bottom. The header SHALL use a three-zone flexbox layout: left zone (sidebar toggle + DSCode branding + model name), center zone (ContextWindowBar), right zone (theme toggle + connection status). The center zone SHALL grow to fill available space. On viewports narrower than 768px, the ContextWindowBar SHALL be hidden and the two-zone layout preserved. During the Chat → Dashboard transition animation (`transitionPhase === "animating"`), ChatView SHALL remain mounted and visible beneath the TransitionCanvas overlay with scroll interaction disabled via the `scrollLocked` prop.

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
- **AND** the tool result text SHALL be rendered through the shared `<Markdown>` component, supporting code blocks with syntax hints, tables, links, and inline code formatting

#### Scenario: Tool result rendered as Markdown
- **WHEN** a tool call card displays its result text
- **THEN** the result body SHALL use the `<Markdown>` component instead of plain text
- **AND** code fences within the result SHALL render as styled code blocks with monospace font

#### Scenario: Empty assistant content renders nothing
- **THEN** the ChatView scroll container remains constrained to the viewport and the user can scroll to the bottom of the conversation to see all content, including the message input and the tail of the assistant bubble
- **AND** the tool result body SHALL retain `max-h-40 overflow-y-auto` as a scroll-defense container
- **THEN** the message bubble content area renders nothing; no "(no content)" placeholder is displayed

#### Scenario: Large tool call result does not break scrolling
- **WHEN** a tool call (e.g., write_file) returns a result that is larger than the viewport height
- **THEN** the ChatView scroll container remains constrained to the viewport and the user can scroll to the bottom of the conversation to see all content, including the message input and the tail of the assistant bubble

#### Scenario: Auto-scroll during streaming is instant — only when at bottom
- **WHEN** the conversation has a streaming message (hasStreaming is true) AND the user's scroll position is within 64px of the container bottom
- **THEN** auto-scroll to the bottom uses `scrollIntoView({ behavior: "instant" })` instead of smooth behavior

#### Scenario: Auto-scroll when idle is smooth — only when at bottom
- **WHEN** the conversation has no streaming message (hasStreaming is false) AND the user's scroll position is within 64px of the container bottom
- **THEN** auto-scroll to the bottom uses `scrollIntoView({ behavior: "smooth" })` for a polished user experience

#### Scenario: Auto-scroll suppressed when user scrolls away
- **WHEN** the user has manually scrolled more than 64px away from the container bottom AND a state change would normally trigger auto-scroll (messages update, processing toggle, permission prompt)
- **THEN** auto-scroll does NOT fire; the user's current scroll position is preserved

#### Scenario: Auto-scroll re-engages on return to bottom
- **WHEN** the user manually scrolls back to within 64px of the container bottom
- **THEN** subsequent state changes resume auto-scrolling to the bottom

#### Scenario: ChatView frozen during transition animation
- **WHEN** `transitionPhase` is `"animating"`
- **THEN** ChatView SHALL receive `scrollLocked={true}` prop
- **AND** ChatView SHALL apply `overflow: hidden` and `pointer-events: none` to its scroll container
- **AND** ChatView SHALL remain mounted and visible beneath the TransitionCanvas overlay

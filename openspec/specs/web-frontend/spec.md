## Purpose

Defines the visual and behavioral requirements for the dscode web frontend, including design language, themes, session management, processing indicators, permission dialogs, transitions, and message rendering.
## Requirements
### Requirement: Warm design language
All frontend components SHALL use the warm design system tokens defined in the `warm-design-system` spec. Every component MUST reference semantic CSS custom properties for colors and follow the typography and shape language specifications.

#### Scenario: Color token adoption
- **WHEN** any component renders a background, text, border, or accent color
- **THEN** it uses `var(--color-*)` references rather than hardcoded hex values or legacy `dscode-*` Tailwind classes

#### Scenario: Typography adoption
- **WHEN** a component renders text
- **THEN** UI chrome, labels, and body text use Geist Sans; only code blocks, inline code, tool names, and file paths use Geist Mono or JetBrains Mono

#### Scenario: Shape adoption
- **WHEN** a message bubble, card, input, or button renders
- **THEN** it follows the flat component shape guidelines: 12px radius for bubbles, 8px for cards/panels, 6px for buttons, `1px solid` borders as the primary separator, no shadows, no gradients

### Requirement: Theme persistence
The frontend SHALL persist the user's theme preference (light or dark) to localStorage and apply it on subsequent visits.

#### Scenario: Theme saved on toggle
- **WHEN** the user toggles the theme
- **THEN** the new preference is saved to localStorage under the key `dscode-theme`

#### Scenario: Theme restored on load
- **WHEN** the app initializes
- **THEN** it reads `dscode-theme` from localStorage and applies the saved theme; if no saved preference exists, it defaults to light mode

### Requirement: Single icon family
The frontend SHALL use exactly one icon library (Phosphor Icons Bold weight recommended) throughout the entire interface. Current inline SVG paths in components MUST be replaced with library icons.

#### Scenario: Icon consistency
- **WHEN** any icon is rendered in the UI (sidebar toggle, close buttons, warning icons, status indicators, expand/collapse arrows)
- **THEN** it uses the chosen icon library with consistent `strokeWidth`

### Requirement: Processing timer driven by turn start anchor
The frontend SHALL compute elapsed processing time from the `turnStartRef` anchor, set by `handleSend` and the `loader { state: "show" }` event, not from the `processing` state flag. The timer SHALL update every animation frame while the anchor is non-zero and reset to 0 when the turn ends. The thinking segment timer is an exception: it SHALL be driven by a per-thinking anchor (`thinkingStartedAt`) recorded at the first `thinking_delta` of each thinking segment, not by `turnStartRef`, so that the displayed elapsed time reflects the current thinking segment rather than the whole turn.

#### Scenario: Timer starts on user submit
- **WHEN** the user sends a message (via Send button or Enter key)
- **THEN** `turnStartRef.current` is set to `Date.now()` in `handleSend` and the elapsed timer begins incrementing from 0s

#### Scenario: Timer increments during thinking
- **WHEN** the model sends `thinking_delta` events for a thinking segment
- **THEN** the `ThinkingBlock` label displays `Thinking · Xs` where X is the elapsed time since that segment's first `thinking_delta`, incrementing approximately every second

#### Scenario: Timer increments during waiting
- **WHEN** `processing` is true but no streaming message has arrived yet (hasStreaming is false)
- **THEN** the `WaitingBubble` displays the elapsed time from `turnStartRef`, incrementing approximately every second

#### Scenario: Timer stops on agent end
- **WHEN** the server sends `loader` event with `state: "hide"` (from `agent_end`)
- **THEN** `turnStartRef.current` is set to 0 and the elapsed timer stops

#### Scenario: Timer starts on vision/OCR pre-processing
- **WHEN** the server sends `loader` event with `state: "show"` and `turnStartRef.current` is 0
- **THEN** `turnStartRef.current` is set to `Date.now()` and the elapsed timer begins incrementing

#### Scenario: Timer resets on error
- **WHEN** the server sends an `error` event
- **THEN** `turnStartRef.current` is set to 0 and the elapsed timer is reset

### Requirement: Thinking and tool details default to collapsed
Thinking blocks and tool cards SHALL remain collapsed by default during live execution and history replay. Live thinking, MCP startup, and tool progress updates SHALL NOT expand them automatically. The user SHALL retain explicit control through the existing disclosure controls, while collapsed headers continue to show status, elapsed time, and progress.

#### Scenario: Live thinking remains collapsed
- **WHEN** an assistant starts or continues streaming thinking
- **THEN** the Thinking body remains collapsed until the user expands it

#### Scenario: Tool execution remains collapsed
- **WHEN** any tool starts or an MCP tool reports progress
- **THEN** the tool body remains collapsed until the user expands it

### Requirement: Active session click is no-op during processing
The session list in the sidebar SHALL suppress the `session load` action when the user clicks the currently active session while `isProcessing` is true. The session item SHALL remain visually clickable (normal appearance, no opacity reduction). The click is a no-op — the conversation view remains unchanged. Non-active sessions continue to be visually disabled via the existing `isDisabled` logic.

#### Scenario: Active session click is no-op during processing
- **WHEN** the agent is processing a request (`isProcessing` is true) and the user clicks the currently active session item in the sidebar
- **THEN** no `session load` action is triggered; the click is a no-op; the session item appearance is unchanged (normal opacity, clickable cursor)

#### Scenario: Active session click works when idle
- **WHEN** the agent is idle (`isProcessing` is false) and the user clicks the currently active session item in the sidebar
- **THEN** the `session load` action fires normally with the session ID

#### Scenario: Inactive session click behavior unchanged
- **WHEN** the agent is processing and the user clicks an inactive session item
- **THEN** the existing `isDisabled` logic applies (opacity reduction, pointer-events none, no action triggered)

### Requirement: Session list disables rows during processing
The session list in the sidebar SHALL visually disable and block interaction with all session rows during processing, except for the active session's row which SHALL remain in normal visual state. The delete button on EVERY session row SHALL be disabled when `processing` is `true`, including the active session row.

#### Scenario: Non-active sessions disabled during processing
- **WHEN** `processing` is `true` and the current session is "A"
- **THEN** all session rows except session A have `opacity: 0.4` and `pointer-events: none`

#### Scenario: Active session delete button disabled during processing
- **WHEN** `processing` is `true` and the user hovers over the active session row
- **THEN** the delete button on that row is not clickable; clicking it has no effect

#### Scenario: Delete button disabled on non-active sessions during processing
- **WHEN** `processing` is `true` and the user hovers over a non-active session row
- **THEN** the delete button on that row is not clickable

#### Scenario: All sessions interactive when idle
- **WHEN** `processing` is `false`
- **THEN** all session rows have normal opacity and pointer-events, and delete buttons are functional

### Requirement: Frontend auto-restores permission dialog from session pendingPermission
The frontend SHALL, upon receiving a `sessions` event, check whether the session matching `currentSessionId` has a `pendingPermission` field. If present, the frontend SHALL automatically render the PermissionDialog component with the stored permission information, regardless of whether a `permission_prompt` event was received.

#### Scenario: PermissionDialog auto-pops on session switch
- **WHEN** the frontend receives a `sessions` event with `currentSessionId: "A"` and session A has `pendingPermission: { toolName: "bash", preview: "ls -la", fuzzyPattern: null }`
- **THEN** the frontend SHALL show the PermissionDialog with toolName "bash" and preview "ls -la"
- **AND** the dialog SHALL have Allow, Always Allow, Save to Settings, Input Idea, and Deny buttons

#### Scenario: PermissionDialog not shown for sessions without pendingPermission
- **WHEN** the frontend receives a `sessions` event where the current session has no `pendingPermission` field
- **THEN** no PermissionDialog is shown (unless a `permission_prompt` event is received separately)

#### Scenario: PermissionDialog clears on session switch away
- **WHEN** the frontend shows a PermissionDialog from a session's `pendingPermission` and the user switches to a different session
- **THEN** the PermissionDialog is dismissed (via `clear_conversation` event)
- **AND** when switching back, the dialog re-appears if `pendingPermission` is still present

### Requirement: PermissionDialog handles restored permission allow
When the user clicks "Allow" on a PermissionDialog restored from `pendingPermission`, the frontend SHALL send a `permission` command with `decision: "allow"` and the stored tool identity. The backend SHALL pre-approve the tool and re-trigger the agent.

#### Scenario: Allow on restored permission
- **WHEN** user clicks "Allow" on a PermissionDialog restored from `pendingPermission: { toolName: "bash", preview: "ls" }`
- **THEN** the frontend SHALL send `{ type: "permission", decision: "allow", toolName: "bash" }`
- **AND** the PermissionDialog closes

#### Scenario: Deny on restored permission
- **WHEN** user clicks "Deny" on a PermissionDialog restored from `pendingPermission`
- **THEN** the frontend SHALL send a command to clear the pending permission
- **AND** the backend SHALL save the session with `pendingPermission` removed
- **AND** the PermissionDialog closes permanently for this session

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

ChatView and its sub-components SHALL mark collidable elements with `data-collider` attributes to enable live DOM-based collision detection during the cascade transition animation. Text line collider spans SHALL be injected by Markdown.tsx via DOM post-processing after a single Markdown render, rather than by ChatView splitting content by newlines into separate Markdown instances.

#### Scenario: text-line marking

- **WHEN** Markdown.tsx renders a completed message's text content
- **THEN** each visible text line inside paragraph-level elements (`<p>`, `<li>`, `<blockquote>`, `<th>`, `<td>`, `<h1>`–`<h4>`) SHALL be wrapped in a `<span data-collider="text-line">` element with no additional styling or layout shift
- **AND** the wrapping SHALL be performed via DOM post-processing after the single Markdown render completes

#### Scenario: code-line marking

- **WHEN** Markdown.tsx renders a code block in a completed message
- **THEN** each line within the `<pre><code>` block SHALL have the attribute `data-collider="code-line"`
- **AND** the code block SHALL be rendered as a single contiguous Markdown block (not split by newlines before parsing)

#### Scenario: tool-card marking

- **WHEN** ToolCard.tsx renders a tool call card
- **THEN** the card container SHALL have the attribute `data-collider="tool-card"`
- **AND** the tool header SHALL have the attribute `data-collider="tool-header"`
- **AND** tool result lines SHALL have the attribute `data-collider="tool-result-line"`

#### Scenario: message-card marking

- **WHEN** ChatView renders a user or assistant message bubble
- **THEN** the bubble container SHALL have the attribute `data-collider="message-card"`

#### Scenario: ChatView renders single Markdown per message

- **WHEN** ChatView renders a user or assistant message with text content
- **THEN** the entire content string SHALL be passed to a single `<Markdown>` component instance
- **AND** the content SHALL NOT be split by newlines before being passed to Markdown

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

### Requirement: Dashboard mode disabled when session has no messages
The `ViewModeSwitcher` component SHALL disable the "Dashboard" option when the current session has no messages (`messages.length === 0`). The "Chat" option SHALL remain selectable. The disabled option SHALL use the HTML `disabled` attribute on the `<option>` element.

#### Scenario: Dashboard option disabled on empty session
- **WHEN** the current session has zero messages (`messages.length === 0`)
- **THEN** the Dashboard `<option>` in the `ViewModeSwitcher` dropdown SHALL have the `disabled` attribute
- **AND** the Chat `<option>` SHALL remain enabled and selectable
- **AND** the guard clause in `handleViewModeChange` SHALL return early without switching modes if `messages.length === 0`

#### Scenario: Dashboard automatically reverts to Chat on message clear
- **WHEN** `viewMode` is `"dashboard"` and `messages` becomes empty (e.g., via `/reset` or session switch)
- **THEN** the frontend SHALL automatically set `viewMode` back to `"chat"`

#### Scenario: Dashboard option enabled when session has messages
- **WHEN** the current session has one or more messages (`messages.length > 0`)
- **THEN** the Dashboard `<option>` SHALL be enabled and selectable

### Requirement: ArtifactContainer single loading state
The `ArtifactContainer` component SHALL render exactly one loading/empty state: bouncing dots with "Generating dashboard..." text. There SHALL be no separate "Waiting for dashboard generation..." state. When `loading` is true or `cleanedHtml` is empty, the same loading animation SHALL display.

#### Scenario: Loading state shows bouncing animation
- **WHEN** `ArtifactContainer` receives `loading={true}` or `html=""`
- **THEN** it SHALL render three bouncing dots with the text "Generating dashboard..."
- **AND** no "Waiting for dashboard generation..." message SHALL appear

### Requirement: Flat message layout for assistant messages
Assistant messages SHALL render using the flat message layout system defined in `flat-message-layout` spec. The existing bubble-based message rendering SHALL be replaced with the `.assistant-msg` flat vertical flow container.

#### Scenario: Assistant message uses flat layout
- **WHEN** an assistant message renders with role `assistant`
- **THEN** it SHALL use the `.assistant-msg` container structure as defined in `flat-message-layout`
- **AND** SHALL NOT use the legacy `.message-card` bubble wrapper

#### Scenario: User message keeps bubble style
- **WHEN** a user message renders with role `user`
- **THEN** it SHALL retain the existing bubble style with `data-collider="message-card"`
- **AND** the bubble SHALL have `border-radius: 16px 16px 4px 16px` and `background: var(--color-user-bubble)`
- **AND** it SHALL use `color: var(--color-user-bubble-text)` and a `1px solid var(--color-border)` boundary
- **AND** the user-bubble tokens SHALL resolve to neutral surfaces rather than accent, warning, or error colors

### Requirement: Thinking block uses div instead of details
The `ThinkingBlock` component SHALL render as a `<div class="thinking">` with a CSS left border rather than a `<details>` element. The thinking content SHALL be always visible.

#### Scenario: Thinking renders as div
- **WHEN** the model sends `thinking_delta` events
- **THEN** the thinking content SHALL render in a `<div class="thinking">` with `border-left: 2px solid var(--border)`
- **AND** SHALL NOT use `<details>` or `<summary>` elements

#### Scenario: Thinking label with dot indicator
- **WHEN** thinking content renders
- **THEN** a label row with "Thinking" uppercase text and a 5px amber dot SHALL appear above the content

### Requirement: Theme support
The frontend SHALL support warm light and warm dark themes using warm stone/taupe gray neutrals (not cream/beige). The initial theme defaults to warm light. Dark mode uses warm deep gray-brown tones instead of cold blue-grays.

#### Scenario: System preference detection
- **WHEN** the app loads and no saved theme preference exists
- **THEN** it applies warm light theme by default

#### Scenario: Manual theme toggle
- **WHEN** user clicks the theme toggle button
- **THEN** the theme switches between warm light and warm dark, the preference is saved to localStorage, and all colors transition smoothly over 300ms

#### Scenario: Warm dark mode
- **WHEN** dark mode is active
- **THEN** backgrounds use warm deep gray-browns (≈ `#1e1c19`), surfaces are warm dark gray (≈ `#282622`), borders are warm dark (≈ `#3a3732`), and text is warm off-white (≈ `#e8e4dd`)

### Requirement: Conversation view
The frontend SHALL display a scrollable conversation area showing user messages, assistant responses with streaming text, thinking blocks with elapsed time indicators, and tool call results, all using the warm flat design system styling. Message state management SHALL use the shared `conversationReducer` from `@dscode/shared/reducer` instead of inline event handling logic. The elapsed time display SHALL be derived from `turnStartRef` (set by `handleSend` or `loader { state: "show" }`) rather than the `processing` state flag. When an assistant message has no text content, the content area SHALL render nothing instead of a "(no content)" placeholder. The conversation scroll container SHALL use `min-height: 0` (Tailwind `min-h-0`) to allow proper flexbox constraint and prevent overflow clipping of large content. Auto-scroll to the bottom SHALL only occur when the user's scroll position is at or near the bottom of the container (within 64px threshold). When the user has manually scrolled away from the bottom, auto-scroll SHALL be suppressed until the user scrolls back to the bottom. The header SHALL use a three-zone flexbox layout: left zone (sidebar toggle + DSCode branding + model name), center zone (ContextWindowBar), right zone (theme toggle + connection status). The center zone SHALL grow to fill available space. On viewports narrower than 768px, the ContextWindowBar SHALL be hidden and the two-zone layout preserved.

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

#### Scenario: Header renders three zones
- **WHEN** the WebUI is loaded on a viewport >= 768px wide and context window data is available
- **THEN** the header SHALL show: left zone (sidebar toggle + DSCode branding + model name), center zone (ContextWindowBar), right zone (theme toggle + connection status)

#### Scenario: Center zone is centered

#### Scenario: ChatView frozen during transition animation
- **WHEN** `transitionPhase` is `"animating"`
- **THEN** ChatView SHALL receive `scrollLocked={true}` prop
- **AND** ChatView SHALL apply `overflow: hidden` and `pointer-events: none` to its scroll container
- **AND** ChatView SHALL remain mounted and visible beneath the TransitionCanvas overlay
- **WHEN** the header renders with all three zones
- **THEN** the center zone SHALL use `flex: 1` and `justify-content: center` so the ContextWindowBar is horizontally centered regardless of left/right content widths

#### Scenario: ContextWindowBar hidden on mobile
- **WHEN** the viewport width is less than 768px
- **THEN** the ContextWindowBar SHALL not be rendered
- **AND** the existing two-zone (left/right) layout SHALL be preserved

### Requirement: Message types imported from shared module
The frontend SHALL import `UIMessage`, `ToolCallEntry`, `ImageAttachment`, `ConversationMessage`, and `ToolCallEntry` types from the shared module (`@dscode/shared/types`) rather than defining them in `web/src/types/index.ts`.

#### Scenario: Import shared UIMessage
- **WHEN** any component references `UIMessage`
- **THEN** the import is from `@dscode/shared/types` or a local re-export thereof

#### Scenario: No duplicate type definitions
- **WHEN** `web/src/types/index.ts` is inspected
- **THEN** it contains no inline `interface UIMessage`, `interface ToolCallEntry`, or `interface ConversationMessage` definitions

### Requirement: Input area
The frontend SHALL provide a text input area at the bottom of the screen with flat, rounded styling using the warm design system. The send button SHALL switch to a Stop button while the agent is processing (when `processing` is true, controlled exclusively by `handleSend` and the `loader` event from `agent_end`). The `assistant_end` event SHALL NOT affect the `processing` state — it only finalizes the streaming message. All text input SHALL be sent via the `chat` command channel; the server determines whether the text is a slash command or a regular chat message. The input SHALL maintain a session-scoped history buffer navigable via ArrowUp/ArrowDown.

#### Scenario: Text input and submit
- **WHEN** user types text and presses Enter (or clicks send button)
- **THEN** a `chat` command is sent via WebSocket with the input text, `processing` is set to `true` immediately, and the submitted text is recorded in the input history buffer before the textarea is cleared

#### Scenario: Input styling
- **WHEN** the input field is rendered
- **THEN** it has `border-radius: 12px`, `border: 1px solid var(--color-border)`, warm surface background, proportional font (Geist Sans), and a subtle accent border color on focus — no glow, no shadow, no pill shape

#### Scenario: Slash command autocomplete
- **WHEN** user types `/` in the input field
- **THEN** a flat dropdown appears with `border-radius: 8px`, `1px solid` border, listing available commands with warm-toned styling and amber highlight for selected item

#### Scenario: At-file autocomplete
- **WHEN** user types `@` in the input field
- **THEN** a flat dropdown appears with matching warm styling

#### Scenario: Multi-line input
- **WHEN** user presses Shift+Enter in the input field
- **THEN** a new line is inserted without submitting

#### Scenario: Input disabled during processing
- **WHEN** the agent is processing a request
- **THEN** the input field is disabled with a muted appearance, and ArrowUp/ArrowDown history navigation is suppressed

#### Scenario: Input history navigation with ArrowUp
- **WHEN** the user presses ArrowUp while the textarea is focused, no popover menu is open, and the input is not processing
- **THEN** the previous submitted text is recalled into the textarea

#### Scenario: Input history navigation with ArrowDown
- **WHEN** the user presses ArrowDown while navigating history and no popover menu is open
- **THEN** the next (more recent) submitted text is recalled, or the user's current draft is restored when past the newest entry

#### Scenario: History navigation reset on typing
- **WHEN** the user recalls a history entry and then types or modifies the text
- **THEN** the history navigation position resets; the next ArrowUp recalls the most recent entry

#### Scenario: Send button becomes Stop button during processing
- **WHEN** `processing` becomes true (via `handleSend`)
- **THEN** the send button is replaced by a Stop button that calls `onAbort` when clicked

#### Scenario: Stop button reverts to Send when processing ends
- **WHEN** the `loader` event with `state: "hide"` is received from the server
- **THEN** `processing` is set to `false` and the Stop button reverts to the Send button

#### Scenario: Slash command text submitted as chat
- **WHEN** user submits text starting with `/` (e.g., `/help`, `/config key value`, or `/Users/foo/bar.ts`)

### Requirement: Session list shows running indicator
The session list in the sidebar SHALL render a rotating spinner icon for the session that is currently active and processing. The indicator SHALL be driven by `isProcessing` and `currentSessionId` from the `sessions` server event.

#### Scenario: Running indicator visible
- **WHEN** the frontend receives a `sessions` event with `currentSessionId: "A"`, `isProcessing: true`, and session A is in the list
- **THEN** session A's row in the sidebar renders a `<Spinner>` icon from Phosphor Icons with CSS rotation animation, opacity 0.6, using `var(--color-accent)` color

#### Scenario: Running indicator not visible on idle
- **WHEN** the frontend receives a `sessions` event with `isProcessing: false`
- **THEN** no session row shows the spinner icon

#### Scenario: Running indicator scoped to current session only
- **WHEN** `currentSessionId` is "A" and `isProcessing` is true
- **THEN** only session A's row shows the spinner; other session rows (B, C) do not

### Requirement: Session list shows running indicator
The session list in the sidebar SHALL render a rotating spinner icon for the session that is currently active and processing. The indicator SHALL be driven by `isProcessing` and `currentSessionId` from the `sessions` server event.

#### Scenario: Running indicator visible
- **WHEN** the frontend receives a `sessions` event with `currentSessionId: "A"`, `isProcessing: true`, and session A is in the list
- **THEN** session A's row in the sidebar renders a `<Spinner>` icon from Phosphor Icons with CSS rotation animation, opacity 0.6, using `var(--color-accent)` color

#### Scenario: Running indicator not visible on idle
- **WHEN** the frontend receives a `sessions` event with `isProcessing: false`
- **THEN** no session row shows the spinner icon

#### Scenario: Running indicator scoped to current session only
- **WHEN** `currentSessionId` is "A" and `isProcessing` is true
- **THEN** only session A's row shows the spinner; other session rows (B, C) do not

### Requirement: clear_conversation resets processing state
The frontend event handler for `clear_conversation` SHALL defensively reset the `processing` state to `false` to ensure the Stop button reverts to Send and the input field becomes enabled, regardless of server event ordering.

#### Scenario: clear_conversation disables processing
- **WHEN** the frontend processes a `clear_conversation` event
- **THEN** `processing` is set to `false`

### Requirement: currentSessionId tracked from sessions event
The frontend SHALL store the `currentSessionId` received from each `sessions` event and use it as the canonical active session identifier for UI highlighting and running indicator rendering.

#### Scenario: currentSessionId updated on sessions event
- **WHEN** the frontend receives a `sessions` event with `currentSessionId: "X"`
- **THEN** `currentSessionId` state is set to `"X"`

#### Scenario: currentSessionId cleared on null
- **WHEN** the frontend receives a `sessions` event without a `currentSessionId` field
- **THEN** `currentSessionId` state is set to `null`
-e 

---

### Requirement: Artifact events handled in App
The App component SHALL handle `artifact_start`, `artifact_delta`, and `artifact_end` server events, accumulating the delta content and passing it to the `ArtifactContainer` component.

#### Scenario: artifact_start clears content
- **WHEN** App receives `{ "type": "artifact_start" }`
- **THEN** the accumulated artifact HTML is set to empty string
- **AND** `artifactLoading` is set to `true`

#### Scenario: artifact_delta appends content
- **WHEN** App receives `{ "type": "artifact_delta", "delta": "<div>" }`
- **THEN** the delta is appended to the accumulated artifact HTML string

#### Scenario: artifact_end finalizes rendering
- **WHEN** App receives `{ "type": "artifact_end" }`
- **THEN** `artifactLoading` is set to `false`

### Requirement: ArtifactContainer component
The frontend SHALL provide an `ArtifactContainer` component that renders an `<iframe>` with `srcdoc` set to the accumulated artifact HTML and `sandbox="allow-same-origin"`.

#### Scenario: ArtifactContainer renders iframe
- **WHEN** `ArtifactContainer` receives a non-empty `html` prop
- **THEN** it renders an `<iframe>` with `srcdoc={html}` and `sandbox="allow-same-origin"`

#### Scenario: ArtifactContainer shows loading
- **WHEN** `ArtifactContainer` receives `loading={true}` and `html` is empty
- **THEN** it displays a spinner or skeleton placeholder

#### Scenario: ArtifactContainer with no content
- **WHEN** `ArtifactContainer` receives `loading={false}` and empty `html`
- **THEN** it displays "Waiting for dashboard generation..." in muted text

### Requirement: Message timestamp display
The frontend SHALL display the real creation time of each chat message in the meta line, formatted via the browser's locale-aware time formatting, and SHALL gracefully omit the time portion when a message has no timestamp.

#### Scenario: User message shows real timestamp
- **WHEN** a user message has `message.createdAt` set to a valid epoch millisecond value
- **THEN** the `UserBubble` meta line SHALL display `"You · HH:MM AM/PM"` (locale-dependent) using `new Date(message.createdAt).toLocaleTimeString()`
- **AND** the time string SHALL reflect the actual message creation time, not a hardcoded value

#### Scenario: Assistant message shows real timestamp
- **WHEN** an assistant message has `message.createdAt` set to a valid epoch millisecond value
- **THEN** the `AssistantMessage` meta line SHALL display `"dscode · HH:MM AM/PM"` (locale-dependent) using `new Date(message.createdAt).toLocaleTimeString()`
- **AND** the time string SHALL reflect the actual message creation time, not a hardcoded value

#### Scenario: Message without timestamp omits time
- **WHEN** a message has `message.createdAt` undefined or absent (e.g., legacy history messages)
- **THEN** the meta line SHALL display only the role label (`"You"` for user, `"dscode"` for assistant) without the time separator or time string
- **AND** no "09:41" or any hardcoded time string SHALL be displayed

#### Scenario: Timestamp updates as new messages arrive
- **WHEN** a new message is created during an active session
- **THEN** its `createdAt` SHALL reflect the wall-clock time at creation
- **AND** the displayed time SHALL differ from the time shown on previously created messages

#### Scenario: All hardcoded time strings removed
- **WHEN** the ChatView renders any message bubble (`UserBubble` or `AssistantMessage`)
- **THEN** no hardcoded time string (such as `"09:41"`) SHALL appear anywhere in the meta line
- **AND** all time values SHALL derive from `message.createdAt`

### Requirement: Thinking block live elapsed indicator
While a thinking segment is streaming, the `ThinkingBlock` label SHALL display the segment's elapsed time (`Thinking · Xs`) driven by a per-thinking anchor recorded in the conversation reducer. The reducer SHALL record `thinkingStartedAt` on the first `thinking_delta` of a segment and `thinkingUpdatedAt` on every `thinking_delta`; both fields are optional, non-persisted, and absent from the wire protocol. The elapsed display SHALL use the shared `formatTime()` convention (`12s`, `2m 5s`) with `tabular-nums` to prevent layout shift, and SHALL tick via a component-local 1s interval rather than the backend `session_time` broadcast. The label dot SHALL pulse (opacity/scale keyframes) while streaming; the pulse animation SHALL be disabled under `prefers-reduced-motion`. When a `text_delta` or `tool_start` arrives for the message, the reducer SHALL clear `thinkingStartedAt` so a subsequent thinking segment restarts its own elapsed time.

#### Scenario: Elapsed starts on first thinking delta
- **WHEN** the reducer processes a `thinking_delta` for a message with no active `thinkingStartedAt`
- **THEN** it records `thinkingStartedAt` and `thinkingUpdatedAt` as the current time, and the label begins displaying `Thinking · 0s`

#### Scenario: Elapsed ticks while streaming
- **WHEN** the thinking segment is streaming
- **THEN** the label elapsed time increments approximately every second using `formatTime()` formatting and `tabular-nums`

#### Scenario: Dot pulses while streaming
- **WHEN** the thinking segment is streaming and `prefers-reduced-motion` is not set
- **THEN** the label dot animates a pulse; under `prefers-reduced-motion` the dot remains static

#### Scenario: New segment restarts elapsed
- **WHEN** a `text_delta` or `tool_start` arrives after a thinking segment, and a later `thinking_delta` begins a new segment
- **THEN** the reducer records a fresh `thinkingStartedAt` and the label elapsed restarts from 0s for the new segment

#### Scenario: Historical messages without anchor
- **WHEN** a message is reconstructed from history (e.g. `ready` event) without `thinkingStartedAt`
- **THEN** the label renders without a live ticking timer (static or frozen display only)

### Requirement: Thinking block frozen summary on completion
When a thinking segment ends (the message receives its first `text_delta` or `tool_start` after thinking, or the turn ends), the `ThinkingBlock` label SHALL switch from the live timer to a frozen summary `Thought for Xs` showing the segment's final elapsed time. The frozen summary SHALL remain visible in the collapsed state, the dot SHALL render static, and the elapsed value SHALL NOT continue incrementing.

#### Scenario: Freeze on first text delta
- **WHEN** a message with a streaming thinking segment receives its first `text_delta`
- **THEN** the label switches to `Thought for Xs` with the final segment elapsed time and stops incrementing

#### Scenario: Freeze on tool start
- **WHEN** a message with a streaming thinking segment receives a `tool_start` before any text
- **THEN** the label switches to `Thought for Xs` with the final segment elapsed time

#### Scenario: Frozen summary visible when collapsed
- **WHEN** the thinking block auto-collapses after streaming ends
- **THEN** the collapsed label still reads `Thought for Xs` and can be expanded by clicking

### Requirement: Thinking stall detection
While a thinking segment is streaming, the frontend SHALL compare the current time against the segment's `thinkingUpdatedAt` on each timer tick. When no `thinking_delta` has arrived for more than 15 seconds, the thinking block SHALL enter a stalled state: the left border and label dot change to the warning color, and the label appends `no output for Xs` (time since last delta) in the warning color. When a new `thinking_delta` arrives, the stalled state SHALL clear automatically and the normal streaming display resumes. Stall detection SHALL be computed entirely on the frontend from delta timestamps, with no backend events or protocol changes.

#### Scenario: Stall warning after threshold
- **WHEN** a streaming thinking segment receives no `thinking_delta` for more than 15 seconds
- **THEN** the block shows warning-colored border and dot, and the label appends `no output for Xs`

#### Scenario: Stall clears on resume
- **WHEN** a `thinking_delta` arrives while the block is in the stalled state
- **THEN** the stalled styling and `no output for Xs` note are removed and normal streaming display resumes

#### Scenario: No stall state after completion
- **WHEN** the thinking segment has ended (frozen summary displayed)
- **THEN** stall detection no longer applies and the frozen label remains unchanged

### Requirement: Phase labels annotated for TransitionCanvas cascade
Each `.phase-label` element within `AssistantMessage` SHALL carry a `data-collider="phase-label"` attribute so that `TransitionCanvas.buildRowList()` discovers and destroys them during the chat-to-dashboard cascade animation. The three phase labels — Thinking, Executing, and Response — SHALL each include this attribute on their outermost `<div>`.

#### Scenario: Phase labels destroyed during cascade
- **WHEN** the user triggers a chat-to-dashboard transition (Dashboard button click)
- **THEN** the cascade animation destroys all Thinking, Executing, and Response phase labels alongside text lines and tool cards, leaving no UI residue

#### Scenario: Phase labels absent from DOM after cascade
- **WHEN** the cascade animation completes and the dashboard view is active
- **THEN** no `.phase-label` elements from the chat view remain visible in the DOM

### Requirement: Warm design language → Editorial workshop design language

The frontend SHALL replace the previous "Warm design language" requirement with
the editorial workshop design language defined by the following scenarios.

All frontend components SHALL use the editorial workshop design system as defined in the `editorial-workshop-layout` spec. The app shell SHALL use the 38px topbar, 220px sidebar with expandable panels, and phase-labeled message groups.

#### Scenario: Color token adoption
- **WHEN** any component renders a background, text, border, or accent color
- **THEN** it uses `var(--color-*)` references with the updated accent value `#b87503`

#### Scenario: Typography adoption
- **WHEN** a component renders text
- **THEN** UI chrome, labels, and body text use Geist Sans; code blocks and technical identifiers use Geist Mono
- **AND** the empty state title SHALL use serif display font at 28px weight 400, phase labels SHALL be 10px weight 600 uppercase
- **AND** panel titles and session names SHALL use serif display font

#### Scenario: Shape adoption
- **WHEN** a message bubble, card, input, or button renders
- **THEN** it follows the editorial workshop radius scale: 20px for input containers, 16px for bubbles, 10px for cards/panels, 6px for buttons and small elements

### Requirement: Sidebar restructured

The sidebar SHALL NOT contain a "Views" section. The sidebar SHALL use 15px icons for all navigation items (Sessions, MCP, Skills, Settings).

#### Scenario: Sidebar nav items
- **WHEN** the sidebar renders
- **THEN** all nav item SVG icons SHALL be 15px × 15px
- **AND** the Settings gear icon SHALL be 15px × 15px

### Requirement: Dashboard mode switcher in topbar

The frontend SHALL replace the existing ViewModeSwitcher `<select>` dropdown
with the topbar Chat↔Dashboard pill switcher defined by the following scenarios.

The Chat↔Dashboard mode toggle SHALL be a pill-style button group in the topbar center, not a `<select>` dropdown. It SHALL only be visible when messages exist. Switching to Dashboard SHALL trigger a transition overlay.

#### Scenario: Mode switcher visible with messages
- **WHEN** the current session has at least one message
- **THEN** the Chat↔Dashboard pill switcher SHALL be visible in the topbar center

#### Scenario: Mode switcher hidden on empty
- **WHEN** the current session has zero messages
- **THEN** the Chat↔Dashboard pill switcher SHALL be hidden

### Requirement: Empty state editorial welcome

The frontend SHALL replace the current empty state (400px card with "DSCode Web"
heading and `/help` instructions) with the editorial welcome state defined by
the following scenarios.

The empty state SHALL be a full-viewport editorial layout: a diamond brand mark, a large title "What would you like to **create** today?", a subtitle, and capability pills.

#### Scenario: Empty state display
- **WHEN** no messages exist and no processing is active
- **THEN** the editorial empty state SHALL be displayed centered in the main content area
- **AND** the mode switcher SHALL be hidden

### Requirement: Editorial workshop design language

All frontend components SHALL use the editorial workshop design system. The app shell SHALL use the 38px topbar, 220px sidebar with resizable expandable detail panels (default 320px), and phase-labeled message groups at 11px.

#### Scenario: Typography adoption
- **WHEN** a component renders text
- **THEN** UI chrome, labels, and body text use Geist Sans; code blocks and technical identifiers use Geist Mono
- **AND** section labels (Create, Capabilities) SHALL be 11px weight 600 uppercase with 0.08em letter-spacing
- **AND** panel titles SHALL use serif display font at 15px weight 500
- **AND** phase labels SHALL be 11px weight 600 uppercase
- **AND** the empty state title SHALL use serif display font at 28px weight 300

#### Scenario: Detail panel resizable
- **WHEN** a detail panel (Sessions, MCP, Skills, Settings) renders
- **THEN** it SHALL use the `useResizablePanel` hook with default 320px, min 240px, max 480px
- **AND** a resize handle SHALL appear on the panel's right edge
- **AND** the width SHALL be persisted to localStorage under `dscode-detail-panel-width`

### Requirement: Inline Agent Activity Card

Web conversation SHALL 为 role=agent 的消息渲染内联 Agent Activity Card。卡片
MUST 遵循 editorial workshop design system，并与 user bubble、assistant message
和 ToolCard 保持可辨识的视觉层级。

#### Scenario: Running Agent Card
- **WHEN** role=agent 且 state 为 running
- **THEN** 卡片显示活动状态点、委派角色 label、attachment、输入摘要和运行耗时
- **AND** 使用 semantic CSS token，不使用硬编码颜色

#### Scenario: Dynamic role hides internal Application
- **WHEN** Researcher 角色由 general Application 执行
- **THEN** 卡片标题显示 Researcher，不显示 general

#### Scenario: Waiting Agent Card
- **WHEN** Agent Activity state 为 waiting
- **THEN** 卡片显示 waiting 标签和最近 progress message

#### Scenario: Completed Agent Card
- **WHEN** Agent Activity state 为 completed
- **THEN** 卡片显示 completed 状态、固定耗时和 output 摘要

#### Scenario: Failed Agent Card
- **WHEN** Agent Activity state 为 failed、terminated 或 killed
- **THEN** 卡片使用 error 或 muted semantic token 显示终态及错误摘要

### Requirement: SubAgent Permission 原位交互

Web conversation SHALL 使用 `agentId` 和 `toolCallId` 将 SubAgent Permission prompt
绑定到对应 Agent Activity Card。匹配的 Tool timeline SHALL 强制展开，Permission
选项 SHALL 显示在对应 Tool 内，不得同时显示独立 Permission Card。Main Agent、
旧协议或无法归属的 prompt SHALL 回退为独立 Permission Card。

#### Scenario: SubAgent 等待 bash 授权
- **WHEN** `permission_prompt.agentId` 匹配当前 Agent Activity 且 `toolCallId` 匹配 bash
- **THEN** bash Tool 行内显示 Allow、Always Allow、Save、Explain 和 Deny
- **AND** 对话流底部不再显示重复的独立 Permission Card

#### Scenario: Main Agent 等待授权
- **WHEN** `permission_prompt` 不包含可匹配的 `agentId` 或 `toolCallId`
- **THEN** Web conversation 继续显示独立 Permission Card

### Requirement: Agent Card 折叠详情

Agent Activity Card SHALL 默认折叠完整 output/error。仅当存在超出摘要的详情时
SHALL 显示展开控件，展开和折叠不得改变消息顺序。

#### Scenario: 展开完整输出
- **WHEN** 用户点击带详情的 Agent Card 展开控件
- **THEN** 卡片在原位置显示完整 output/error
- **AND** 详情区域有最大高度与垂直滚动

#### Scenario: 再次折叠
- **WHEN** 用户再次点击展开控件
- **THEN** 卡片恢复摘要状态且对话滚动位置不发生非预期跳跃

### Requirement: Agent Card 可访问性

Agent Activity Card 的状态、展开控件和 progress MUST 可由键盘和辅助技术识别。

#### Scenario: 键盘展开
- **WHEN** 展开控件获得焦点且用户按 Enter 或 Space
- **THEN** 详情展开状态切换
- **AND** 控件的 `aria-expanded` 反映当前状态

#### Scenario: 状态不只依赖颜色
- **WHEN** 卡片显示任意 Agent state
- **THEN** 状态同时使用文本和图标表达，不只通过颜色区分

### Requirement: Agent Card 参与对话布局

Agent Activity Card SHALL 参与现有 scroll、auto-scroll 和 Chat-to-Dashboard
collider 体系，但 MUST NOT 使用 assistant response 的 phase label。

#### Scenario: Activity 到达且用户在底部
- **WHEN** 新 Agent Activity 到达且用户位于对话底部阈值内
- **THEN** conversation 按既有规则自动滚动到新卡片

#### Scenario: 用户已滚离底部
- **WHEN** Agent Activity 更新且用户已滚离底部超过阈值
- **THEN** UI 保持当前滚动位置

#### Scenario: Dashboard transition
- **WHEN** Chat-to-Dashboard transition 扫描 conversation collider
- **THEN** Agent Activity Card 作为独立 card collider 被处理

### Requirement: Web keeps planning under Agent control
The Web composer SHALL remain a single Chat input and SHALL NOT expose an
`Auto / Plan` selector, Plan workbench, dedicated Plan page, or separate
planning navigation. Main Agent SHALL decide whether to execute directly,
investigate, or use the internal Planner.

#### Scenario: User submits a sufficiently specified request
- **WHEN** the request contains enough user intent to determine the visible outcome
- **THEN** the Agent proceeds through the existing Chat experience without opening a planning surface

#### Scenario: Agent uses an internal Plan
- **WHEN** complexity routing starts or revises an internal PlanRecord
- **THEN** the Web UI does not expose routing scores, candidates, revision, digest, effect grants, evidence, control tools, or Agent process details

### Requirement: Authorized Plan has one global Chat output
After Planner internally authorizes an executable PlanRecord, the Web UI SHALL
project one global Plan output in Chat before the live TODO. It SHALL derive the
output deterministically from the persisted PlanRecord without another model
call and SHALL keep it collapsed by default.

#### Scenario: Plan is authorized
- **WHEN** a Plan enters `approved` with executable items
- **THEN** Chat shows a collapsed `执行计划 · 已就绪` disclosure before TODO, and execution does not start before that projection is published

#### Scenario: User expands the Plan
- **WHEN** the user opens the Plan disclosure
- **THEN** it shows the goal, committed user constraints, selected approach summaries, change scope or side effects, ordered execution steps, and verification approach

#### Scenario: Plan is collapsed
- **WHEN** the disclosure has not been opened or the Session projection is restored
- **THEN** only its title and current Plan status consume conversation space; PlanExecutionStep count is not presented as TODO count

#### Scenario: Internal details exist
- **WHEN** the persisted Plan contains candidate alternatives, internal IDs, revision, digest, grants, evidence, control tools, or private reasoning
- **THEN** the global output omits them and does not duplicate raw Plan JSON into UI messages or the model transcript

#### Scenario: Plan is replanned
- **WHEN** a material conflict derives a new revision
- **THEN** Chat keeps the last authorized output while replanning and atomically replaces the same output after the new revision is authorized, without appending a duplicate

### Requirement: Current task state is visible as an inline TODO
When Main maintains TaskState for the current request, the Web UI SHALL show one
inline TODO list immediately after any global Plan output and SHALL update it
from the persisted `TaskState.todoList`. The Web UI MUST NOT derive TODO from
PlanExecutionStep, verification, Tool, AgentProcess, or continuation state.

#### Scenario: Planner authorizes execution with TaskState
- **WHEN** the Plan enters `approved` or `executing` and Main initializes TaskState
- **THEN** Chat inserts `计划已生成`, projects the collapsed global Plan output, and then shows each TodoItem's outcome title and current pending, in-progress, completed, blocked, or skipped state

#### Scenario: Direct execution creates TaskState
- **WHEN** autonomous routing selects Direct and Main creates a multi-item TaskState
- **THEN** Chat shows TODO without requiring or fabricating a global Plan output

#### Scenario: Main advances task state
- **WHEN** Main commits a newer TaskState version
- **THEN** Chat updates the existing TODO list without exposing context mutation calls, raw Plan JSON, verification, evidence, revision, digest, or runtime counters

#### Scenario: Main corrects an invalid verification command
- **WHEN** Host rejects an aggregated Bash verification command as a retryable `invalid_command`
- **THEN** Chat removes that internal correction Tool row after classification while preserving real Bash failures and Plan scope conflicts, and the current TodoItem remains in progress

#### Scenario: Execution messages accumulate
- **WHEN** Thinking, Tool, or assistant messages are appended after Plan authorization
- **THEN** Chat keeps exactly one global Plan output followed by one live TODO after the latest message instead of leaving execution state behind at the original Plan marker

#### Scenario: Execution finishes or the Session reconnects
- **WHEN** the task reaches a terminal state or the client restores the owning Session
- **THEN** Chat restores the latest authorized global Plan output when one exists and independently restores the final TaskState TODO

#### Scenario: Terminal transition clears execution authorization
- **WHEN** a cancelled or failed Plan no longer contains its approval
- **THEN** Chat retains the same Plan's last authorized public output and renders TODO statuses from the independent TaskState snapshot

#### Scenario: Execution requires replanning
- **WHEN** a material conflict derives a revision from the current Plan
- **THEN** Chat retains the last authorized Plan output and current TODO, labels execution `正在调整执行计划`, replaces only the Plan after the new revision is authorized, updates the result marker to `执行计划已更新`, and changes TODO only when Main commits a TaskState mutation

#### Scenario: Runtime stops automatic continuation
- **WHEN** Host exhausts the automatic continuation budget
- **THEN** Chat retains the current in-progress TodoItem and reports that automatic execution stopped; it does not label the item blocked unless TaskState contains a structured external blocker

#### Scenario: Blocker is visible
- **WHEN** TaskState contains a blocked TodoItem
- **THEN** Chat shows its public reason and recovery action without exposing internal errors, paths, counters, or evidence IDs

### Requirement: User intent alignment is native to Chat
The Web UI SHALL render a pending user-value decision as an inline Chat
interaction. It SHALL contain one concise question, exactly one recommended option,
at most three user-understandable options, and a free-form adjustment path.

#### Scenario: Creative direction is underspecified
- **WHEN** a request such as “创建一个俄罗斯方块小游戏” does not determine the visual style
- **THEN** Host persists a pending `visual_direction` alignment requirement and the first user decision asks for that direction in Chat before any implementation side effect

#### Scenario: Alignment options are shown
- **WHEN** a persisted user-value decision is projected into Chat
- **THEN** one option is visibly labeled as recommended and selected initially

#### Scenario: User selects a suggested direction
- **WHEN** the user chooses an inline option
- **THEN** the client sends the typed interaction identity and selected value, the selection becomes an explicit constraint, Chat records the committed choice as a deduplicated user entry without adding it to the model transcript, and the Agent resumes autonomously

#### Scenario: User provides a custom direction
- **WHEN** none of the suggested options matches the user's intent
- **THEN** the user can enter a concise custom constraint without leaving Chat

#### Scenario: Several value requirements are unresolved
- **WHEN** the Plan contains multiple pending alignment requirements
- **THEN** Chat presents and consumes one persisted requirement at a time, and neither compilation nor execution starts while another remains pending

### Requirement: Completed Plan produces one visible final report
The Web Chat SHALL hide execution-phase assistant narration and SHALL show one
final assistant report after a completed Plan. The report SHALL identify
delivered results, verification actually run and its conclusions, and anything
unverified or still missing.

#### Scenario: Execution narration is produced
- **WHEN** Main emits intermediate prose while automatic Plan execution is active
- **THEN** Web omits that prose from live rendering and Session replay while preserving visible Tool results allowed by the normal projection

#### Scenario: Plan completes
- **WHEN** Host enters report phase after terminal cleanup
- **THEN** Web shows the final report once, after TaskState reflects the outcomes actually delivered

#### Scenario: Report has a gap
- **WHEN** verification was not run or an outcome remains incomplete
- **THEN** Web displays that fact in the final report and does not present it as passed

### Requirement: Agent owns technical planning decisions
The UI SHALL NOT ask the user to choose between implementation techniques,
investigation strategies, backtracking points, or replanning mechanics unless
the choice changes a user-visible outcome or an explicit product constraint.

#### Scenario: Technical candidates are equivalent to the user
- **WHEN** multiple feasible implementation paths preserve the same visible behavior and constraints
- **THEN** the Agent selects the best-supported path without requesting a user decision

#### Scenario: A trade-off changes the product outcome
- **WHEN** candidate paths imply different visible behavior, scope, compatibility, cost, or reversibility that cannot be inferred
- **THEN** the Agent asks one Chat-native alignment question framed in user terms

### Requirement: Chat remains responsive while alignment is pending
The UI SHALL use the existing Chat pending/streaming treatment and SHALL NOT
show a standalone “正在准备规划” screen. A pending alignment SHALL be the first
actionable output, and no side-effect tool may run before it is resolved.

#### Scenario: Alignment generation takes time
- **WHEN** the Agent is determining whether user input is required
- **THEN** Chat shows its normal lightweight activity state and keeps Stop available without mounting a Plan module

#### Scenario: Foreground ownership transfers to Planner
- **WHEN** Main finishes its routing turn while a foreground Planner is still generating the alignment
- **THEN** Chat shows `Waiting...` as soon as the Plan route is known, inserts an `进入 Planning Mode` timeline marker when Planner starts, keeps the lightweight processing state visible, and does not expose Planner tools or restore an idle composer

#### Scenario: Alignment is pending
- **WHEN** the server publishes a persisted alignment interaction
- **THEN** the inline controls remain reachable above the composer on desktop, mobile, and `1080x322`, while the main composer remains non-submittable until Planner ownership ends

### Requirement: Disconnected Chat submissions are lossless
The Web composer SHALL only enter processing and clear its draft after the
command is accepted by an open WebSocket.

#### Scenario: User attempts to submit while reconnecting
- **WHEN** the WebSocket is not open
- **THEN** the composer and Send control are disabled, any existing draft is retained, and Chat does not enter processing

#### Scenario: Connection is restored
- **WHEN** the WebSocket opens and the user submits
- **THEN** the command is sent before the draft is cleared and Chat enters its normal processing state

#### Scenario: Alignment command cannot be sent
- **WHEN** the user submits an intent alignment while the WebSocket cannot accept the command
- **THEN** the interaction remains actionable, does not enter a permanent busy state, and can be submitted again after reconnection

### Requirement: Existing permission UI remains the authorization boundary
The Web UI SHALL NOT request approval for an entire Plan. Filesystem,
process, network, and external-write authorization SHALL continue through the
existing permission interaction when required by Harness policy.

#### Scenario: Internal Plan contains a side effect
- **WHEN** an execution step reaches a protected side-effect tool
- **THEN** the existing permission prompt is shown without a preceding Plan approval panel

#### Scenario: Internal Plan changes
- **WHEN** new evidence causes replanning
- **THEN** the Agent updates its internal path and only returns to Chat alignment if a new user-value decision is required

### Requirement: Chat alignment remains separate from hidden reasoning
The persisted interaction identity and selected constraint SHALL remain typed
and recoverable, while hidden prompts, Chain-of-Thought, technical candidate
trees, and raw Plan state SHALL NOT be inserted into the model transcript.

#### Scenario: Session reconnects with pending alignment
- **WHEN** the Web client reconnects or switches back to the owning Session
- **THEN** the same inline alignment interaction is restored once without synthetic assistant reasoning

#### Scenario: Theme or viewport changes
- **WHEN** Chat alignment is displayed in light or dark theme at supported desktop and mobile sizes
- **THEN** it uses existing `--color-*` tokens, remains keyboard accessible, and introduces no horizontal clipping or inaccessible nested scrolling

### Requirement: Web Chat renders execution episode state
Web Chat SHALL render running, reflecting, paused-inconclusive, and completed episode
states inside the existing conversation execution hierarchy. The projection SHALL use
the server snapshot and MUST keep Plan, TODO, and episode state visually distinct.

#### Scenario: Episode is running
- **WHEN** the current server snapshot phase is `running`
- **THEN** Chat shows bounded execution activity and the persisted completed-versus-total outcome count

#### Scenario: Episode is reflecting
- **WHEN** the current server snapshot phase is `reflecting`
- **THEN** Chat states that one automatic reflection is in progress without presenting a new Agent persona

#### Scenario: Episode pauses inconclusively
- **WHEN** the current server snapshot phase is `paused_inconclusive`
- **THEN** Chat labels unfinished outcomes `未验证`, preserves their TODO states, and shows the concise incident reason

#### Scenario: Episode is completed
- **WHEN** the authoritative snapshot phase is `completed`
- **THEN** Chat shows completion only for outcomes recorded complete by Plan and TaskState

### Requirement: Web Chat offers explicit paused recovery
When an episode is `paused_inconclusive`, Web Chat SHALL provide Adjust Plan and
Continue Execution actions bound to the current server snapshot. The controls SHALL
disable while their command is pending and SHALL surface typed conflicts by replacing
stale local state with the returned snapshot.

#### Scenario: User chooses Adjust Plan
- **WHEN** the user activates Adjust Plan on the paused state
- **THEN** the client sends the typed adjust command and returns the conversation to Plan alignment when accepted

#### Scenario: User chooses Continue Execution
- **WHEN** the user activates Continue Execution on the paused state
- **THEN** the client sends the typed continue command and renders running only after the server returns the new episode

#### Scenario: Page reloads while paused
- **WHEN** the user reloads or reconnects to a paused Session
- **THEN** the same paused state and recovery actions are restored without automatic execution

### Requirement: Web execution state is accessible and layout-stable
Episode labels, progress, reasons, and actions SHALL remain readable in supported light
and dark themes and at desktop and mobile widths. State SHALL be conveyed by text in
addition to color, and controls SHALL have keyboard focus and accessible names.

#### Scenario: Narrow viewport shows recovery actions
- **WHEN** the paused state renders at a mobile width
- **THEN** reason text and both recovery actions remain visible without horizontal overflow or overlap

#### Scenario: Keyboard user reviews pause
- **WHEN** focus reaches a paused episode
- **THEN** the state, unverified outcome count, reason, and both action names are available to assistive technology

## ADDED Requirements

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
The frontend SHALL compute elapsed processing time from the `turnStartRef` anchor, set by `handleSend` and the `loader { state: "show" }` event, not from the `processing` state flag. The timer SHALL update every animation frame while the anchor is non-zero and reset to 0 when the turn ends.

#### Scenario: Timer starts on user submit
- **WHEN** the user sends a message (via Send button or Enter key)
- **THEN** `turnStartRef.current` is set to `Date.now()` in `handleSend` and the elapsed timer begins incrementing from 0s

#### Scenario: Timer increments during thinking
- **WHEN** the model sends `thinking_delta` events and `turnStartRef.current > 0`
- **THEN** the `ThinkingBlock` summary displays `Thinking... (Xs)` where X increments approximately every second

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


## MODIFIED Requirements

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
The frontend SHALL display a scrollable conversation area showing user messages, assistant responses with streaming text, thinking blocks with elapsed time indicators, and tool call results, all using the warm flat design system styling. Message state management SHALL use the shared `conversationReducer` from `@dscode/shared/reducer` instead of inline event handling logic. The elapsed time display SHALL be derived from `turnStartRef` (set by `handleSend` or `loader { state: "show" }`) rather than the `processing` state flag. When an assistant message has no text content, the content area SHALL render nothing instead of a "(no content)" placeholder. The conversation scroll container SHALL use `min-height: 0` (Tailwind `min-h-0`) to allow proper flexbox constraint and prevent overflow clipping of large content. Auto-scroll to the bottom SHALL only occur when the user's scroll position is at or near the bottom of the container (within 64px threshold). When the user has manually scrolled away from the bottom, auto-scroll SHALL be suppressed until the user scrolls back to the bottom.

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
The session list in the sidebar SHALL render a rotating spinner icon for the session that is currently active and processing. It SHALL NOT render any other visual indicator (no accent left border, no colored dot) for the active session. The indicator SHALL be driven by `isProcessing` and `currentSessionId` from the `sessions` server event.

#### Scenario: Running indicator visible
- **WHEN** the frontend receives a `sessions` event with `currentSessionId: "A"`, `isProcessing: true`, and session A is in the list
- **THEN** session A's row in the sidebar renders a `<Spinner>` icon from Phosphor Icons with CSS rotation animation, opacity 0.6, using `var(--color-accent)` color

#### Scenario: Running indicator not visible on idle
- **WHEN** the frontend receives a `sessions` event with `isProcessing: false`
- **THEN** no session row shows the spinner icon

#### Scenario: Running indicator scoped to current session only
- **WHEN** `currentSessionId` is "A" and `isProcessing` is true
- **THEN** only session A's row shows the spinner; other session rows (B, C) do not

#### Scenario: No accent border or colored dot on active session
- **WHEN** any session row is rendered as the active session
- **THEN** it does NOT render a left-side accent border (`borderLeft: 3px solid`) nor a colored dot indicator; only the `accent-bg` background and the Spinner (when processing) distinguish the active session
The frontend SHALL support attaching images to messages via paste from clipboard, with flat, warm-toned thumbnail previews.

#### Scenario: Paste image from clipboard
- **WHEN** user pastes image data (Ctrl+V / Cmd+V) while input is focused

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

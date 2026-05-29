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
The frontend SHALL display a scrollable conversation area showing user messages, assistant responses with streaming text, thinking blocks, and tool call results, all using the warm flat design system styling.

#### Scenario: User message display
- **WHEN** user submits a message
- **THEN** the message appears right-aligned with a warm amber accent background and warm white text, using `border-radius: 12px` bubble shape with subtle fade-up entrance animation (disabled under `prefers-reduced-motion`)

#### Scenario: Streaming assistant response
- **WHEN** the server sends `text_delta` events
- **THEN** the assistant message bubble updates incrementally using the warm surface background, `1px solid` border, and warm text colors

#### Scenario: Thinking block display
- **WHEN** the server sends `thinking_delta` events
- **THEN** the thinking content appears in a collapsible block with muted warm styling and a subtle left border accent, distinct from the main response

#### Scenario: Tool call display
- **WHEN** the server sends `tool_start` and `tool_end` events
- **THEN** each tool call appears as an inline flat card with `border-radius: 8px`, `1px solid` warm border, tool name in monospace with amber accent, and muted pastel success/error indicators

### Requirement: Input area
The frontend SHALL provide a text input area at the bottom of the screen with flat, rounded styling using the warm design system.

#### Scenario: Text input and submit
- **WHEN** user types text and presses Enter (or clicks send button)
- **THEN** a `chat` command is sent via WebSocket with the input text

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
- **THEN** the input field is disabled with a muted appearance

### Requirement: Image upload
The frontend SHALL support attaching images to messages via paste from clipboard, with flat, warm-toned thumbnail previews.

#### Scenario: Paste image from clipboard
- **WHEN** user pastes image data (Ctrl+V / Cmd+V) while input is focused
- **THEN** the image is attached to the pending message and shown as a thumbnail with `border-radius: 8px` and `1px solid` border

#### Scenario: Remove attached image
- **WHEN** user clicks the remove button on an attached image thumbnail
- **THEN** the image is removed from the pending message

### Requirement: Permission dialog
The frontend SHALL display a flat modal dialog when the server requests tool execution permission, with warm-toned styling that feels advisory rather than alarming.

#### Scenario: Permission prompt appears
- **WHEN** server sends a `permission_prompt` event
- **THEN** a flat modal dialog appears with warm surface background, `border-radius: 12px`, `1px solid` border, and muted amber warning styling (not bright yellow), showing the tool name and a preview

#### Scenario: User allows once
- **WHEN** user clicks "Allow" on the permission dialog
- **THEN** a `permission` command with `decision: "allow"` is sent and the dialog closes

#### Scenario: User always allows
- **WHEN** user clicks "Always Allow" on the permission dialog
- **THEN** a `permission` command with `decision: "always_allow"` is sent and the dialog closes

#### Scenario: User denies
- **WHEN** user clicks "Deny" on the permission dialog
- **THEN** a `permission` command with `decision: "deny"` is sent and the dialog closes

### Requirement: Sidebar with sessions and tools
The frontend SHALL provide a collapsible sidebar with flat warm-toned surfaces, `1px solid` borders, and a single amber accent for active indicators.

#### Scenario: Sidebar styling
- **WHEN** the sidebar is rendered
- **THEN** it uses a warm surface background, `border-right: 1px solid var(--color-border)` as the separator, and a subtle amber underline for active tab — no shadows, no gradients

#### Scenario: Session list
- **WHEN** user opens the sidebar sessions panel
- **THEN** all saved sessions are listed with flat card styling (`border-radius: 8px`, `1px solid` border on hover)

#### Scenario: Save current session
- **WHEN** user clicks "Save" in the session panel
- **THEN** the current session is saved and appears in the list

#### Scenario: Load a session
- **WHEN** user clicks on a saved session
- **THEN** that session is loaded and the conversation view updates

#### Scenario: Delete a session
- **WHEN** user clicks delete on a session
- **THEN** the session is removed after confirmation

### Requirement: MCP browser panel
The frontend SHALL provide a panel to browse connected MCP servers and their tools using warm flat styling.

#### Scenario: Server list display
- **WHEN** user opens the MCP browser panel
- **THEN** all configured MCP servers are listed with flat warm-toned cards and muted pastel status indicators

#### Scenario: Tool list for a server
- **WHEN** user clicks on an MCP server
- **THEN** the tools provided by that server are displayed in monospace with warm muted styling

### Requirement: Configuration panel
The frontend SHALL provide a settings panel with flat warm-toned form controls and consistent spacing.

#### Scenario: Settings panel styling
- **WHEN** the settings panel is rendered
- **THEN** form inputs and selects use `border-radius: 8px`, `border: 1px solid var(--color-border)`, warm surface background, and amber accent on focus — no shadows, no gradients

#### Scenario: Model switching
- **WHEN** user selects a different model from the dropdown
- **THEN** a `config` command is sent with the new model ID

#### Scenario: Thinking level adjustment
- **WHEN** user selects a thinking level
- **THEN** a `config` command is sent with the new thinking level

#### Scenario: API key management
- **WHEN** user enters and saves a new API key
- **THEN** a `config` command is sent and the key is stored

### Requirement: Responsive layout
The frontend SHALL adapt to different screen sizes while maintaining the warm flat design language at all breakpoints.

#### Scenario: Desktop layout
- **WHEN** viewport width is >= 768px
- **THEN** sidebar is visible by default alongside the main conversation area, separated by a `1px solid` border

#### Scenario: Mobile layout
- **WHEN** viewport width is < 768px
- **THEN** sidebar is hidden and accessible via a hamburger menu button

### Requirement: Connection status indicator
The frontend SHALL display the WebSocket connection status using warm-toned muted pastel indicators.

#### Scenario: Connected state
- **WHEN** WebSocket connection is active
- **THEN** a status indicator shows "Connected" using the muted pastel green token

#### Scenario: Disconnected state with reconnection
- **WHEN** WebSocket connection drops
- **THEN** a status indicator shows "Reconnecting..." using the muted pastel red token

### Requirement: Error handling and display
The frontend SHALL display system errors and info messages as flat toast notifications with warm-toned styling.

#### Scenario: Info toast
- **WHEN** server sends an `info` event
- **THEN** a flat warm-toned toast notification appears (no shadow, `1px solid` border, `border-radius: 8px`) and auto-dismisses after 3 seconds

#### Scenario: Error toast
- **WHEN** server sends an `error` event
- **THEN** a flat error toast appears with muted pastel red background and remains until dismissed

### Requirement: Empty state
The frontend SHALL display a warm, welcoming empty state when no messages are present.

#### Scenario: Empty conversation
- **WHEN** the conversation has no messages
- **THEN** a centered welcome card appears with flat warm styling (`border-radius: 12px`, `1px solid` border, warm surface background), a greeting in proportional font, and helpful hints in muted text

### Requirement: Subtle message animations
The frontend SHALL use quiet, restrained animations for message appearance. All animations MUST honor `prefers-reduced-motion`.

#### Scenario: New message animation
- **WHEN** a new message bubble is added to the conversation
- **THEN** it fades in with `opacity: 0 → 1` and `translateY(12px → 0)` over 600ms, disabled entirely under `prefers-reduced-motion: reduce`

#### Scenario: Tool card expansion
- **WHEN** a tool card is expanded or collapsed
- **THEN** the content area transitions smoothly over 200ms

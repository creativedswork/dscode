## ADDED Requirements

### Requirement: Conversation view
The frontend SHALL display a scrollable conversation area showing user messages, assistant responses with streaming text, thinking blocks, and tool call results.

#### Scenario: User message display
- **WHEN** user submits a message
- **THEN** the message appears right-aligned in the conversation area with a distinct user style

#### Scenario: Streaming assistant response
- **WHEN** the server sends `text_delta` events
- **THEN** the assistant message bubble updates incrementally, showing the partial text in real time

#### Scenario: Thinking block display
- **WHEN** the server sends `thinking_delta` events
- **THEN** the thinking content appears in a collapsible, dimmed block above the main response

#### Scenario: Tool call display
- **WHEN** the server sends `tool_start` and `tool_end` events
- **THEN** each tool call appears as an inline card showing tool name, arguments, result preview, and success/error status

### Requirement: Input area
The frontend SHALL provide a text input area at the bottom of the screen for composing messages and triggering slash commands.

#### Scenario: Text input and submit
- **WHEN** user types text and presses Enter (or clicks send button)
- **THEN** a `chat` command is sent via WebSocket with the input text

#### Scenario: Slash command autocomplete
- **WHEN** user types `/` in the input field
- **THEN** a dropdown appears listing available commands with descriptions, and typing filters the list

#### Scenario: Multi-line input
- **WHEN** user presses Shift+Enter in the input field
- **THEN** a new line is inserted without submitting

#### Scenario: Input disabled during processing
- **WHEN** the agent is processing a request (loader visible)
- **THEN** the input field is disabled and shows a "Processing..." placeholder

### Requirement: Image upload
The frontend SHALL support attaching images to messages via drag-and-drop, paste from clipboard, or file picker.

#### Scenario: Drag and drop image
- **WHEN** user drags an image file onto the conversation area
- **THEN** the image is attached to the pending message and shown as a thumbnail preview

#### Scenario: Paste image from clipboard
- **WHEN** user pastes image data (Ctrl+V / Cmd+V) while input is focused
- **THEN** the image is attached to the pending message

#### Scenario: Click to upload
- **WHEN** user clicks the attachment button and selects an image file
- **THEN** the image is attached to the pending message

#### Scenario: Remove attached image
- **WHEN** user clicks the remove button on an attached image thumbnail
- **THEN** the image is removed from the pending message

### Requirement: Permission dialog
The frontend SHALL display a modal dialog when the server requests tool execution permission, with options to Allow, Always Allow, or Deny.

#### Scenario: Permission prompt appears
- **WHEN** server sends a `permission_prompt` event
- **THEN** a modal dialog appears showing the tool name and a preview of the operation

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
The frontend SHALL provide a collapsible sidebar containing session management controls and MCP server/tool browser.

#### Scenario: Session list
- **WHEN** user opens the sidebar sessions panel
- **THEN** all saved sessions are listed with title, date, and message count

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
The frontend SHALL provide a panel to browse connected MCP servers and their tools with status indicators.

#### Scenario: Server list display
- **WHEN** user opens the MCP browser panel
- **THEN** all configured MCP servers are listed with connection status (connected/connecting/error/disconnected) and tool count

#### Scenario: Tool list for a server
- **WHEN** user clicks on an MCP server
- **THEN** the tools provided by that server are displayed with names and descriptions

### Requirement: Configuration panel
The frontend SHALL provide a settings panel for viewing and changing model, thinking level, and API key.

#### Scenario: Model switching
- **WHEN** user selects a different model from the dropdown
- **THEN** a `config` command is sent with the new model ID, and the UI updates

#### Scenario: Thinking level adjustment
- **WHEN** user selects a thinking level from the options
- **THEN** a `config` command is sent with the new thinking level

#### Scenario: API key management
- **WHEN** user enters and saves a new API key
- **THEN** a `config` command is sent and the key is stored (displayed masked)

### Requirement: Theme support
The frontend SHALL support light and dark themes, defaulting to the system preference.

#### Scenario: System preference detection
- **WHEN** the app loads
- **THEN** it applies light or dark theme based on `prefers-color-scheme` media query

#### Scenario: Manual theme toggle
- **WHEN** user clicks the theme toggle button
- **THEN** the theme switches between light and dark and the preference is saved to localStorage

### Requirement: Responsive layout
The frontend SHALL adapt to different screen sizes, with the sidebar collapsing on narrow screens.

#### Scenario: Desktop layout
- **WHEN** viewport width is >= 768px
- **THEN** sidebar is visible by default alongside the main conversation area

#### Scenario: Mobile layout
- **WHEN** viewport width is < 768px
- **THEN** sidebar is hidden and accessible via a hamburger menu button

### Requirement: Connection status indicator
The frontend SHALL display the WebSocket connection status and automatically attempt reconnection on disconnect.

#### Scenario: Connected state
- **WHEN** WebSocket connection is active
- **THEN** a green indicator is shown with "Connected" status

#### Scenario: Disconnected state with reconnection
- **WHEN** WebSocket connection drops
- **THEN** a red indicator appears with "Reconnecting..." and the client attempts reconnection every 2 seconds

### Requirement: Error handling and display
The frontend SHALL display system errors and info messages as toast notifications that auto-dismiss.

#### Scenario: Info toast
- **WHEN** server sends an `info` event
- **THEN** a toast notification appears at the top of the screen and auto-dismisses after 3 seconds

#### Scenario: Error toast
- **WHEN** server sends an `error` event
- **THEN** a red error toast appears and remains until dismissed by the user

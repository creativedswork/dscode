## ADDED Requirements

### Requirement: Slash command session load in Web UI
The Web UI slash command `/session load <id>` SHALL load a previously saved session and display the restored conversation messages in the conversation view, matching the behavior of the sidebar session load button.

#### Scenario: Load session via slash command
- **WHEN** the user types `/session load <id>` in the Web UI input and submits
- **THEN** the backend loads the session, clears the conversation view, rebuilds the conversation history from the loaded agent state, and sends a `ready` event containing the restored `ConversationMessage[]` to the WebSocket client

#### Scenario: Messages display correctly after slash load
- **WHEN** the frontend receives the `ready` event following a `/session load` slash command
- **THEN** the conversation view displays all restored messages (user, assistant, tool calls, thinking blocks) exactly as it does when loading via the sidebar session button

#### Scenario: Session load info message
- **WHEN** the session is loaded successfully via slash command
- **THEN** an informational message is displayed showing the session ID, title, model, project path, creation date, and message count

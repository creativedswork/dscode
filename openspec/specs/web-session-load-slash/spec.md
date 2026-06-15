## ADDED Requirements

### Requirement: Slash command session load in Web UI
The Web UI slash command `/session load <id>` SHALL, before loading the requested session: (1) abort the current agent turn if one is running, (2) save the current session to disk, and (3) send an updated session list via `pushSessionList`. Only after these steps SHALL it load the target session, clear the conversation view, rebuild the conversation history from the loaded agent state, and send a `ready` event containing the restored `ConversationMessage[]` to the WebSocket client.

#### Scenario: Load session via slash command
- **WHEN** the user types `/session load <id>` in the Web UI input and submits
- **THEN** the backend aborts any running turn, saves the current session, pushes the updated session list, loads the target session, clears the conversation view, rebuilds the conversation history, and sends a `ready` event

#### Scenario: Messages display correctly after slash load
- **WHEN** the frontend receives the `ready` event following a `/session load` slash command
- **THEN** the conversation view displays all restored messages (user, assistant, tool calls, thinking blocks) exactly as it does when loading via the sidebar session button

#### Scenario: Session load info message
- **WHEN** the session is loaded successfully via slash command
- **THEN** an informational message is displayed showing the session ID, title, model, project path, creation date, and message count

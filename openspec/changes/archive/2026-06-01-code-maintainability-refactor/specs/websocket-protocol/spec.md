## ADDED Requirements

### Requirement: Info events carry display mode
The `info` server-to-client event SHALL include a `display` field with value `"toast"` or `"panel"`, explicitly communicating the intended presentation mode. The client SHALL use this field directly instead of inspecting the message text content.

#### Scenario: Info event with toast display
- **WHEN** the server sends a single-line informational message suitable for transient display
- **THEN** the event SHALL be `{"type":"info","text":"Session saved.","display":"toast"}`

#### Scenario: Info event with panel display
- **WHEN** the server sends a multi-line or multi-entry informational message (e.g., listing available models, drivers, slash commands)
- **THEN** the event SHALL be `{"type":"info","text":"Available models:\n- gpt-4o\n- claude-3-opus","display":"panel"}`

#### Scenario: Client routes by display field
- **WHEN** the Web frontend receives an `info` event
- **THEN** it SHALL check `event.display` to decide rendering: `"panel"` → CommandPanel, `"toast"` → Toast
- **AND** SHALL NOT inspect `event.text` content (no `includes("\n")`, `startsWith("Available")`, etc.)

## MODIFIED Requirements

### Requirement: System message events
The protocol SHALL support info and error system messages from server to client for non-conversation notifications. Info messages SHALL include a `display` field.

#### Scenario: Info message
- **WHEN** the system has an informational message (e.g., session saved)
- **THEN** server sends `{"type":"info","text":"Session saved.","display":"toast"}`

#### Scenario: Error message
- **WHEN** the system encounters an error (e.g., invalid config)
- **THEN** server sends `{"type":"error","text":"Unknown command: /foo"}`

### Requirement: Event types and direction
The WebSocket protocol SHALL define a clear set of event types for bidirectional communication, with client-to-server messages called "commands" and server-to-client messages called "events". The ClientCommand type SHALL include a `set_vision_delete` config action to remove the vision model configuration entirely. Base types used within commands and events SHALL be imported from the shared UI data model (`src/ui/shared/types.ts`).

#### Scenario: Client sends a chat command
- **WHEN** client sends `{"type":"chat","text":"Hello","images":[]}` via WebSocket
- **THEN** server processes the message as a user input and begins streaming the assistant response

#### Scenario: Server sends text delta events
- **WHEN** the AI model produces text output during streaming
- **THEN** server sends `{"type":"text_delta","delta":"partial text..."}` events incrementally

#### Scenario: Client sends set_vision_delete
- **WHEN** client sends `{"type":"config","action":"set_vision_delete"}` via WebSocket
- **THEN** server removes the entire vision configuration and broadcasts the updated ConfigData to all clients

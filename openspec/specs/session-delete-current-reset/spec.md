## ADDED Requirements

### Requirement: Delete current session resets conversation UI
When the currently active session is deleted via the sidebar delete action, the system SHALL reset the main conversation view to the welcome page state and clear the sidebar's active session highlight.

#### Scenario: Delete current session from sidebar
- **WHEN** the user clicks the delete button on the currently active session in the sidebar while not processing
- **THEN** the session is removed from disk and the session list
- **AND** the frontend receives a `clear_conversation` event that empties the message array
- **AND** the frontend receives a `sessions` event with `currentSessionId: null`
- **AND** the ChatView renders the welcome page (empty state with DSCode logo and tips)
- **AND** the sidebar shows no active session highlight

#### Scenario: Delete non-current session does not reset UI
- **WHEN** the user clicks the delete button on a session that is NOT the currently active session
- **THEN** the session is removed from disk and the session list
- **AND** no `clear_conversation` event is sent
- **AND** the ChatView continues showing the current session's messages unchanged
- **AND** the sidebar continues highlighting the current session

#### Scenario: Delete current session during processing is blocked
- **WHEN** the agent is processing a turn and the user hovers over the active session's delete button
- **THEN** the delete button is not clickable (disabled by existing `isProcessing` guard)
- **AND** no delete action is triggered

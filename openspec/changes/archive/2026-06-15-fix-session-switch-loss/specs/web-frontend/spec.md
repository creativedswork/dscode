## ADDED Requirements

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

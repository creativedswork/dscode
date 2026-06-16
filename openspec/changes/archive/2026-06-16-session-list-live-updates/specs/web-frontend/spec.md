## ADDED Requirements

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

## MODIFIED Requirements

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

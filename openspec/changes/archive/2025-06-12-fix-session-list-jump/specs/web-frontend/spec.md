## ADDED Requirements

### Requirement: Session list sidebar
The frontend SHALL display a session list in the sidebar under the "Sessions" tab, showing saved conversation sessions sorted by most recently updated. The session list SHALL be contained in a scrollable area within the sidebar content panel. Each session entry SHALL display the session title, last updated date, and message count. The currently active session SHALL be visually highlighted.

#### Scenario: Session list displays saved sessions
- **WHEN** the "Sessions" tab is active and sessions have been loaded from the server
- **THEN** the sidebar displays a scrollable list of session entries, each showing title, date, and message count

#### Scenario: Active session is highlighted
- **WHEN** a session ID matches `currentSessionId`
- **THEN** that session entry has a distinct background color (`var(--color-accent-bg)`) to indicate it is the active session

#### Scenario: Session list scroll position preserved across data refreshes
- **WHEN** the server pushes a `sessions` event while the sessions tab is active
- **THEN** the session list scroll position does not jump to the top; the user's current scroll view is preserved

#### Scenario: Session list empty state
- **WHEN** no sessions exist for the current project
- **THEN** the sessions panel displays "No saved sessions" in muted text

#### Scenario: New session button
- **WHEN** the user clicks the "New Session" button in the sessions panel
- **THEN** a `/reset` command is sent to the server, starting a fresh conversation

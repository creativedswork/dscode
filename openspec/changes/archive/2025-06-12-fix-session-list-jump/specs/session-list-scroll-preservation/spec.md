## ADDED Requirements

### Requirement: Session list scroll position preservation
The session list sidebar SHALL preserve the user's scroll position across data refreshes from the server. When the `sessions` WebSocket event triggers a state update, the scroll container SHALL restore the previous `scrollTop` value so the user's view of the session list is not disrupted.

#### Scenario: Scroll position preserved after chat turn completes
- **WHEN** the server sends a `sessions` event (e.g., after a chat turn completes) and the sessions tab is active in the sidebar
- **THEN** the session list's scroll position (`scrollTop`) is restored to the value it had before the state update, without any visible jump to the top

#### Scenario: Scroll position preserved after session save
- **WHEN** the user saves a session via `/session save` and the server pushes an updated session list
- **THEN** the session list scroll position remains unchanged

#### Scenario: Scroll position preserved after session delete
- **WHEN** the user deletes a session and the server pushes an updated session list
- **THEN** the session list scroll position adjusts naturally (content removed) but does not jump to the top

#### Scenario: Natural scroll on tab switch
- **WHEN** the user switches away from the sessions tab and back again
- **THEN** the session list scroll position resets to the top, representing a fresh view of the tab content

#### Scenario: User scroll is not blocked
- **WHEN** the user manually scrolls the session list after a data refresh
- **THEN** the scroll position follows the user's input and is not forcibly restored to a saved value

### Requirement: Session list state update deduplication
The frontend SHALL avoid unnecessary state updates when the server pushes session data that is identical to the current state. Before calling `setSessions`, the event handler SHALL compare the incoming `SessionInfo[]` with the current state using a shallow comparison of `id`, `updatedAt`, and `messageCount` fields.

#### Scenario: Identical data triggers no update
- **WHEN** the server sends a `sessions` event with data identical to the current sessions state (same ids, same `updatedAt` and `messageCount` for each item)
- **THEN** `setSessions` is not called and no re-render of `SessionsPanel` occurs

#### Scenario: Changed data triggers update
- **WHEN** the server sends a `sessions` event with a different `updatedAt` or `messageCount` for any session
- **THEN** `setSessions` is called with the new data and `SessionsPanel` re-renders with scroll position preserved

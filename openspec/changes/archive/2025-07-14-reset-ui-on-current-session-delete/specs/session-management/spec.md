## ADDED Requirements

### Requirement: SessionManager clears current on delete
`SessionManager.deleteSession()` SHALL clear `this.current` (set to `null`) when the deleted session ID matches the currently active session ID. This ensures `getCurrentSessionId()` returns `null` after the active session is deleted.

#### Scenario: Delete active session clears current
- **WHEN** `deleteSession("ABC")` is called and `this.current?.id === "ABC"`
- **THEN** `this.current` is set to `null` before the `session:deleted` event is emitted
- **AND** `getCurrentSessionId()` returns `null`

#### Scenario: Delete non-active session preserves current
- **WHEN** `deleteSession("XYZ")` is called and `this.current?.id === "ABC"` (different from "XYZ")
- **THEN** `this.current` remains unchanged (still points to session "ABC")
- **AND** `getCurrentSessionId()` returns `"ABC"`

#### Scenario: Delete when no current session is set
- **WHEN** `deleteSession("ABC")` is called and `this.current` is `null`
- **THEN** no error is thrown
- **AND** `getCurrentSessionId()` returns `null`

### Requirement: WebUiBackend sends clear_conversation on current session delete
The `WebUiBackend.handleSession` delete handler SHALL, before calling `deleteSession()`, capture whether the deleted session is the currently active session. If it is, the handler SHALL send a `clear_conversation` event (in addition to the updated session list) so the frontend resets its message state. The handler SHALL also include `currentSessionId` in the `sessions` response.

#### Scenario: Delete current session sends clear_conversation
- **WHEN** the client sends `{ type: "session", action: "delete", id: "<currentSessionId>" }`
- **THEN** the handler captures `wasCurrent = true` before calling `deleteSession()`
- **AND** after successful deletion, sends `{ type: "clear_conversation" }` to the requesting client
- **AND** sends `{ type: "sessions", currentSessionId: null, data: [...] }` with the updated list

#### Scenario: Delete non-current session does not send clear_conversation
- **WHEN** the client sends `{ type: "session", action: "delete", id: "<nonCurrentSessionId>" }`
- **THEN** the handler captures `wasCurrent = false` before calling `deleteSession()`
- **AND** after successful deletion, does NOT send `clear_conversation`
- **AND** sends `{ type: "sessions", currentSessionId: "<stillCurrentId>", data: [...] }` with the updated list

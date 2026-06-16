## ADDED Requirements

### Requirement: Active session click is no-op during processing
The session list in the sidebar SHALL suppress the `session load` action when the user clicks the currently active session while `isProcessing` is true. The session item SHALL remain visually clickable (normal appearance, no opacity reduction). The click is a no-op — the conversation view remains unchanged. Non-active sessions continue to be visually disabled via the existing `isDisabled` logic.

#### Scenario: Active session click is no-op during processing
- **WHEN** the agent is processing a request (`isProcessing` is true) and the user clicks the currently active session item in the sidebar
- **THEN** no `session load` action is triggered; the click is a no-op; the session item appearance is unchanged (normal opacity, clickable cursor)

#### Scenario: Active session click works when idle
- **WHEN** the agent is idle (`isProcessing` is false) and the user clicks the currently active session item in the sidebar
- **THEN** the `session load` action fires normally with the session ID

#### Scenario: Inactive session click behavior unchanged
- **WHEN** the agent is processing and the user clicks an inactive session item
- **THEN** the existing `isDisabled` logic applies (opacity reduction, pointer-events none, no action triggered)

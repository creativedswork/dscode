## ADDED Requirements

### Requirement: Running session shows spinner in sidebar
The sidebar session list SHALL render a rotating spinner indicator next to the session item when that session is the current active session AND the agent is processing (streaming output).

#### Scenario: Spinner visible on running session
- **WHEN** `sessions` event is received with `currentSessionId: "A"`, `isProcessing: true`, and session list includes session A
- **THEN** session A's item in the sidebar renders a rotating `<Spinner>` icon from Phosphor Icons, styled with `@keyframes spin { to { transform: rotate(360deg); } }` CSS animation at 1s linear infinite, opacity 0.6, color `var(--color-accent)`

#### Scenario: No spinner when processing is false
- **WHEN** `sessions` event is received with `isProcessing: false`
- **THEN** no session item shows a spinner, regardless of `currentSessionId`

#### Scenario: No spinner for non-current sessions
- **WHEN** `sessions` event is received with `currentSessionId: "A"` and `isProcessing: true`
- **THEN** only session A shows the spinner; other sessions (B, C) do not show a spinner

#### Scenario: Spinner disappears when processing ends
- **WHEN** a running session's turn finishes and server sends `sessions` event with `isProcessing: false`
- **THEN** the spinner is removed from the session item

#### Scenario: Spinner uses Phosphor Icons
- **WHEN** the spinner icon is rendered
- **THEN** it uses the `Spinner` component from `@phosphor-icons/react` with `weight="bold"` and `size={14}`

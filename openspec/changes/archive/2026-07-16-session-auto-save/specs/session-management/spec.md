## ADDED Requirements

### Requirement: Pre-turn session save on user message

Session MUST be saved to disk immediately after the user's message is pushed to `agent.state.messages` and before the LLM call begins.

**Event**: `message_end` from pi-agent-core agent subscription, when `event.message.role === "user"`

#### Scenario: User submits a prompt

- **GIVEN** a session is active with N messages on disk
- **WHEN** `agent.prompt(text)` is called, user message is pushed to `agent.state.messages`, and `message_end` fires with `message.role === "user"`
- **THEN** `SessionManager.trySaveSession()` is called
- **AND** the session file on disk contains N+1 messages (including the new user message)
- **AND** subsequent LLM call proceeds normally

#### Scenario: Process killed after pre-turn save

- **GIVEN** pre-turn save completed successfully
- **WHEN** process is killed (SIGKILL, crash, freeze) during the subsequent LLM call
- **THEN** user message is preserved in the session file on disk
- **AND** session can be reloaded and resumed from the user message

#### Scenario: Non-user message_end does not trigger save

- **GIVEN** an agent loop is running
- **WHEN** `message_end` fires for a tool result or assistant message (role !== "user")
- **THEN** no session save is triggered

---

### Requirement: Periodic auto-save during agent execution

Session MUST be saved periodically (every 15 seconds) during agent execution when new messages have been added since the last save.

#### Scenario: Auto-save triggers during long streaming

- **GIVEN** a session with last saved message count M
- **AND** auto-save timer is running (15s interval)
- **WHEN** `agent.state.messages.length` exceeds M (new messages added since last save)
- **THEN** `SessionManager.trySaveSession()` is called
- **AND** `lastSavedMessageCount` is updated to current message count

#### Scenario: Auto-save skips when no new messages

- **GIVEN** a session with last saved message count M
- **AND** auto-save timer fires
- **WHEN** `agent.state.messages.length` equals M
- **THEN** no save is performed (no dirty data)

#### Scenario: Auto-save does not block process exit

- **GIVEN** auto-save timer is running
- **WHEN** the process exits normally (SIGINT, shutdown)
- **THEN** timer does not prevent exit (`.unref()` is called on the timer)
- **AND** timer is cleared during `shutdown()`

#### Scenario: All save paths share dirty counter

- **GIVEN** a session where pre-turn save just completed
- **AND** `lastSavedMessageCount` is now set to current message count
- **WHEN** auto-save timer fires 5 seconds later
- **THEN** `agent.state.messages.length` equals `lastSavedMessageCount`
- **AND** no redundant save is triggered

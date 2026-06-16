## ADDED Requirements

### Requirement: Session list updates after each assistant turn
The server SHALL push the updated session list to all connected WebSocket clients after each assistant turn completes (i.e., when `finishAssistantMessage()` is called by the harness). This ensures the sidebar reflects the current session metadata—message count, title, and preview—in real time as the agent runs, not only at discrete boundary points.

#### Scenario: Session list updates after first assistant turn
- **WHEN** a user sends a prompt and the agent completes its first turn (thinking → tools → text)
- **THEN** the server broadcasts a `sessions` event with the updated session list containing the current session with `messageCount >= 1`

#### Scenario: Session list updates after multi-turn agent run
- **WHEN** the agent completes its second turn (e.g., after a tool call triggers continuation)
- **THEN** the server broadcasts a `sessions` event with the current session's updated `messageCount` reflecting both user and assistant messages

#### Scenario: Session list pushes to all connected clients
- **WHEN** the server broadcasts session list updates from `finishAssistantMessage()`
- **THEN** all connected WebSocket clients receive the `sessions` event, not just the client that initiated the prompt

#### Scenario: Session list still updates at end of agent run
- **WHEN** the agent fully completes (agent_end → setProcessing(false) → loader:hide)
- **THEN** the server still pushes the session list (existing behavior) as a final update, ensuring metadata is consistent even if `finishAssistantMessage` was not called

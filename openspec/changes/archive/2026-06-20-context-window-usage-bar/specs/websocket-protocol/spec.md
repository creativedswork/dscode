## ADDED Requirements

### Requirement: Context window event
The WebSocket protocol SHALL include a `context_window` server-to-client event type that carries token usage breakdown data.

#### Scenario: Server sends context_window after turn end
- **WHEN** the agent completes a turn (`assistant_end`)
- **THEN** the server SHALL broadcast a `context_window` event with the updated token breakdown

#### Scenario: Server sends context_window on connect
- **WHEN** a WebSocket connection is established and the `ready` event is sent
- **THEN** the server SHALL also send a `context_window` event with the current token breakdown

#### Scenario: Server sends context_window after clear
- **WHEN** the conversation is cleared via `/reset`
- **THEN** the server SHALL broadcast a `context_window` event with used=0

#### Scenario: Context window event payload structure
- **WHEN** the server sends a `context_window` event
- **THEN** the payload SHALL include: `type: "context_window"`, `total: number` (context window size), `used: number` (total tokens used), `free: number` (available tokens), `categories: { system: number, user: number, thinking: number, fileRead: number, fileEdit: number, terminal: number, browser: number, other: number }`

### Requirement: Context window event throttling
The server SHALL throttle `context_window` event broadcasts to at most once per 500ms during active streaming (between `assistant_start` and `assistant_end`). The event at `assistant_end` SHALL always be sent regardless of throttle window.

#### Scenario: Throttling during tool calls
- **WHEN** multiple tool calls complete within a 500ms window during a streaming turn
- **THEN** only the first `context_window` event is sent immediately; subsequent ones are coalesced and sent at most 500ms after the last one

#### Scenario: No throttle at turn end
- **WHEN** `assistant_end` fires and the last `context_window` was sent 100ms ago
- **THEN** the `context_window` event SHALL still be sent immediately (throttle bypassed at turn end)

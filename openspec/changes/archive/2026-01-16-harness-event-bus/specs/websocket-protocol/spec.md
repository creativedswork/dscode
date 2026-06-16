## ADDED Requirements

### Requirement: WebSocket server sources events from HarnessEventBus

The WebSocket server (or WebUiBackend acting as server) SHALL subscribe to `HarnessEventBus` and relay events to connected clients. The existing WebSocket message types (`text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `info`, `error`, `loader`, `mcp_state`, `config`, `sessions`) SHALL be derived from the corresponding `HarnessEventBus` events rather than emitted from scattered `broadcast()` calls.

#### Scenario: text_delta from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "llm:text:delta", delta: "Hello" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "text_delta", delta: "Hello" }` to all connected clients

#### Scenario: thinking_delta from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "llm:thinking:delta", delta: "..." }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "thinking_delta", delta: "..." }` to all connected clients

#### Scenario: tool_start from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "tool:start", name: "bash", args: {...} }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "tool_start", name: "bash", args: {...} }` to all connected clients

#### Scenario: tool_end from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "tool:end", name: "bash", result: "...", isError: false }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "tool_end", name: "bash", result: "...", isError: false }` to all connected clients

#### Scenario: info from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "ui:info", text: "Saved.", display: "toast" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "info", text: "Saved.", display: "toast" }` to all connected clients

#### Scenario: error from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "ui:error", text: "Failed." }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "error", text: "Failed." }` to all connected clients

#### Scenario: loader show/hide from processing events

- **WHEN** `HarnessEventBus` emits `{ type: "processing:start" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "loader", state: "show" }` to all connected clients
- **WHEN** `HarnessEventBus` emits `{ type: "processing:stop" }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "loader", state: "hide" }` to all connected clients

#### Scenario: mcp_state from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "mcp:state", servers: [...] }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "mcp_state", servers: [...] }` to all connected clients

#### Scenario: config from event bus

- **WHEN** `HarnessEventBus` emits `{ type: "config:change", data: {...} }`
- **THEN** the WebSocket server SHALL broadcast `{ type: "config", data: {...} }` to all connected clients

### Requirement: WebSocket protocol message contract unchanged

The wire format (JSON message types sent over WebSocket) SHALL NOT change. Clients continue to receive `text_delta`, `thinking_delta`, `tool_start`, `tool_end`, `info`, `error`, `loader`, `mcp_state`, `config`, and `sessions` messages with identical payload shapes. Only the server-side source of these messages changes from direct method calls to event bus subscriptions.

#### Scenario: Client receives identical text_delta

- **WHEN** the AI generates text output during streaming
- **THEN** the client SHALL receive `{ "type": "text_delta", "delta": "..." }` with the same structure as before the event bus migration

#### Scenario: Client receives identical tool_start

- **WHEN** the agent invokes a tool
- **THEN** the client SHALL receive `{ "type": "tool_start", "name": "...", "args": {...} }` with the same structure as before

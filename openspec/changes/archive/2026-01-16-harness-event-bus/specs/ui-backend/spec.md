## ADDED Requirements

### Requirement: UiBackend consumes events via HarnessEventBus

The `UiBackend` interface SHALL no longer include notification methods for streaming, tool execution, system messages, config changes, or MCP state. Implementations SHALL receive `HarnessEventBus` and subscribe to events in their constructors.

#### Scenario: No notification methods on interface

- **WHEN** TypeScript compiles code that accesses `harness.ui`
- **THEN** `thinkingDelta`, `textDelta`, `toolStart`, `toolEnd`, `startAssistantMessage`, `finishAssistantMessage`, `addInfo`, `addError`, `addWarning`, `addRetry`, `addPendingImage`, `clearConversationView`, `focusEditor`, `setProcessing`, `setMcpManager`, `pushMcpState`, `openMcpBrowser`, `onConfigChange` SHALL NOT exist on the `UiBackend` type

### Requirement: WebUiBackend bridges events to WebSocket

The `WebUiBackend` SHALL subscribe to all HarnessEventBus events and relay them to connected WebSocket clients. It SHALL NOT maintain separate `broadcast()` methods for each event type; instead, each event handler serializes and forwards the event.

#### Scenario: llm:text:delta forwarded as text_delta

- **WHEN** WebUiBackend receives `{ type: "llm:text:delta", delta: "Hello" }`
- **THEN** it SHALL broadcast `{ type: "text_delta", delta: "Hello" }` to connected WebSocket clients

#### Scenario: tool:start forwarded as tool_start

- **WHEN** WebUiBackend receives `{ type: "tool:start", name: "bash", args: { command: "ls" } }`
- **THEN** it SHALL broadcast `{ type: "tool_start", name: "bash", args: { command: "ls" } }` to connected WebSocket clients

#### Scenario: config:change broadcasts updated config

- **WHEN** WebUiBackend receives `{ type: "config:change", data: {...} }`
- **THEN** it SHALL broadcast `{ type: "config", data: {...} }` to all connected WebSocket clients

### Requirement: TuiBackend renders from events

The `TuiBackend` SHALL subscribe to all HarnessEventBus events and render content to the terminal in response. It SHALL maintain the same rendering behavior as the pre-event-bus implementation.

#### Scenario: TuiBackend receives llm:text:delta

- **WHEN** TuiBackend receives `{ type: "llm:text:delta", delta: "Hello" }`
- **THEN** it SHALL append "Hello" to the current assistant message in the terminal

#### Scenario: TuiBackend receives tool:start

- **WHEN** TuiBackend receives `{ type: "tool:start", name: "bash", args: {...} }`
- **THEN** it SHALL display a tool execution indicator in the terminal

## REMOVED Requirements

### Requirement: onConfigChange callback

**Reason**: Config change notifications are now handled via `config:change` event on `HarnessEventBus`. The `onConfigChange` callback on `UiBackend` is replaced by a subscription to `config:change`.

**Migration**: Each backend subscribes to `harness.events.on("config:change", handler)` in its constructor instead of implementing `onConfigChange()` on the interface.

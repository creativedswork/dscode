## Why

Harness currently calls UiBackend (40+ methods) and SessionManager directly, creating tight coupling and timing bugs. Every new lifecycle-aware module requires modifying both Harness and UiBackend. We need an event-driven architecture where Harness emits events and modules subscribe independently.

## What Changes

- **Introduce `HarnessEventBus`** — a typed event emitter with a discriminated union of ~25 event types covering LLM streaming, tool execution, turn lifecycle, processing state, session lifecycle, UI notifications, config changes, and MCP state
- **Slim UiBackend to 4 methods** — keep only `start()`, `waitForExit()`, `shutdown()`, and `getPromptPermission()`; the remaining 35+ methods become event subscriptions
- **Harness emits events instead of calling UiBackend directly** — `promptAndSave()`, agent callbacks, config changes, and MCP state changes all route through the event bus
- **SessionManager subscribes to `turn:start` / `turn:end`** for timer management instead of being called directly by Harness
- **WebUiBackend broadcasts events to WebSocket clients** via subscription, eliminating manual `broadcast()` calls scattered throughout the backend
- **TuiBackend renders by subscribing** to the same events, receiving identical information as the Web backend
- **BREAKING**: UiBackend interface loses ~35 methods. Any external UiBackend implementation must migrate to event subscriptions.
- **BREAKING**: `Harness.setUi()` semantics change — the UI backend no longer receives direct method calls for streaming, tool events, etc.

## Capabilities

### New Capabilities

- `harness-event-bus`: Typed event emitter with discriminated union event types, `on()`/`off()` subscription API, and zero-allocation emit path. Defines the complete event catalog (LLM, tool, turn, processing, session, UI, config, MCP).
- `ui-backend-slim`: Reduced UiBackend interface with exactly 4 lifecycle/request-response methods. UiBackend implementations consume events via HarnessEventBus subscription in their constructor.

### Modified Capabilities

- `core-harness`: Harness creates and owns the event bus; calls to `this.ui.*` are replaced with `this.events.emit(...)`; `promptAndSave()` emits turn lifecycle events; agent callbacks emit streaming/tool events
- `ui-backend`: Interface shrinks from 40+ methods to 4; `onConfigChange` removed (replaced by `config:change` event); backends receive `HarnessEventBus` via constructor
- `harness-api`: Exposes `events: HarnessEventBus` so backends can subscribe; event bus becomes part of the public API surface
- `session-management`: SessionManager accepts `HarnessEventBus` and subscribes to `turn:start`/`turn:end` for timer lifecycle instead of being called by Harness methods
- `websocket-protocol`: WebSocket server subscribes to HarnessEventBus and broadcasts events to clients; eliminates ad-hoc `broadcast()` calls from WebUiBackend

## Impact

- **`src/core/`**: New `events.ts` with `HarnessEventBus` class and `HarnessEvent` type
- **`src/harness.ts`**: Major refactor — create event bus, replace `this.ui.*` calls with `this.events.emit(...)`, remove direct SessionManager timer calls
- **`src/ui-backend.ts`**: Interface reduced to 4 methods; remove `onConfigChange`
- **`src/web/web-backend.ts`**: Subscribe to events in constructor; broadcast to WebSocket clients
- **`src/tui/tui-backend.ts`**: Subscribe to events in constructor; render in handlers
- **`src/session-manager.ts`**: Accept event bus, subscribe to turn events for timer
- **`src/web/websocket-server.ts`**: Subscribe to event bus, relay to clients
- **`src/harness-api.ts`**: Add `events: HarnessEventBus` field

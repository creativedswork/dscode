## Context

Current `Harness` → module communication is direct method calls. `UiBackend` has 25+ methods mixing lifecycle control, streaming, system messages, MCP, and config notifications. Harness calls `this.ui.*` in `bindEvents()` (agent event callbacks), `promptAndSave()` (retry flow), and various methods (config change, MCP state). SessionManager timer calls (`startActiveTimer`/`stopActiveTimer`) are interleaved with UI calls in Harness agent subscriptions.

Two bugs motivate this change:
1. `agent_start` is per-conversation, so timer/UI prep bound to it doesn't fire on subsequent turns
2. Adding a new lifecycle-aware module (analytics, cost tracker, logging) requires modifying both Harness and UiBackend

## Goals / Non-Goals

**Goals:**
- Decouple Harness from consumer modules via a typed event bus
- Slim UiBackend to only lifecycle methods (`start`, `waitForExit`, `shutdown`) and the request-response `getPromptPermission`
- Make SessionManager an autonomous subscriber, not a Harness callee
- Enable WebSocket broadcasting via event subscription, not scattered ad-hoc calls
- Zero breaking changes to the event catalog — add-only

**Non-Goals:**
- Persistent event log or replay
- Distributed/process-external events
- Wildcard or pattern-based subscriptions
- Changing the Agent's internal event model (Agent events stay as-is; HarnessEventBus wraps them)
- Async event handlers (handlers are fire-and-forget sync calls)

## Decisions

### Decision 1: In-process, typed discriminated union emitter

**Chosen**: A single `HarnessEventBus` class with a `Map<string, Set<EventHandler>>` and a discriminated union type `HarnessEvent` with `type` as the discriminator.

**Alternatives considered**:
- *Node EventEmitter*: No type safety on event names/payloads. Handler signatures are untyped `(...args: any[])`.
- *RxJS Subject*: Heavy dependency for this use case. Cold/hot confusion. Overkill for synchronous in-process dispatch.
- *mitt*: Small but still untyped — `emit(type, payload)` loses the discriminated union.

**Rationale**: TypeScript discriminated union gives us compile-time checking of event names and payload shapes. The implementation is ~40 lines and has no dependencies. The `type` field doubles as the event name and the discriminator, so `bus.on("llm:text:delta", handler)` is fully typed — the handler parameter is `{ type: "llm:text:delta", delta: string }`.

### Decision 2: UiBackend keeps 4 methods, loses everything else

**Chosen**: UiBackend interface becomes:
```typescript
interface UiBackend {
  start(): Promise<void>;
  waitForExit(): Promise<void>;
  shutdown(): Promise<void>;
  getPromptPermission(): (toolName: string, preview: string, args: unknown) => Promise<PermissionPromptResult>;
}
```

**What leaves and where it goes**:

| Old Method | New Location |
|---|---|
| `addUserMessage` | Subscribes to `message:user` |
| `thinkingDelta` / `textDelta` | Subscribes to `llm:thinking:delta` / `llm:text:delta` |
| `toolStart` / `toolEnd` | Subscribes to `tool:start` / `tool:end` |
| `startAssistantMessage` / `finishAssistantMessage` | Subscribes to `turn:streaming:start` / `turn:streaming:end` |
| `setProcessing` | Subscribes to `processing:start` / `processing:stop` |
| `addInfo` / `addError` / `addWarning` | Subscribes to `ui:info` / `ui:error` / `ui:warning` |
| `addRetry` | Subscribes to `llm:retry` |
| `addPendingImage` | Subscribes to `ui:image:pending` |
| `clearConversationView` | Subscribes to `ui:conversation:clear` |
| `focusEditor` | Subscribes to `ui:focus:editor` |
| `onConfigChange` | Subscribes to `config:change` |
| `pushMcpState` | Subscribes to `mcp:state` |
| `openMcpBrowser` | Subscribes to `mcp:browser:open` |
| `setMcpManager` | Direct harness field access (`harness.mcpManager`) |

**Rationale**: The 4 retained methods are the only ones that require Harness to orchestrate timing (`start` → `waitForExit` → `shutdown`) or return a value (`getPromptPermission`). Everything else is fire-and-forget notification — exactly what an event bus excels at.

### Decision 3: Event bus owned by Harness, passed to consumers via constructor

**Chosen**: Harness creates `this.events = new HarnessEventBus()` in its constructor. Backends receive it via `{ harness: HarnessAPI, events: HarnessEventBus }`. SessionManager receives it similarly. The WebSocket server grabs a reference from the WebUiBackend or gets one injected.

**Alternatives considered**:
- *Singleton/global*: Makes testing hard. Multiple Harness instances (rare but possible) would share a bus.
- *Separate module with `getEventBus()`*: Effectively a singleton. Same testing issues.
- *Backends create their own bus*: Defeats the purpose — nothing connects Harness to backends.

**Rationale**: The event bus is part of the Harness's identity — it's how the Harness communicates. Passing it alongside `HarnessAPI` makes the dependency explicit and testable.

### Decision 4: Synchronous emit, fire-and-forget handlers

**Chosen**: `emit(event)` iterates handlers synchronously. No async/await. If a handler throws, the error is caught and logged, and remaining handlers continue.

**Rationale**: Events represent "this happened" notifications. Handlers should not block the emitter. The UI backends push to render queues (TUI) or WebSocket send buffers (Web) — both are non-blocking. Making emit async would force Harness to await UI rendering, coupling turn timing to presentation.

### Decision 5: WebSocket server subscribes to event bus directly

**Chosen**: `WebSocketServer` receives the `HarnessEventBus` and subscribes to every event type, serializing each to a WebSocket message of the same `type`. The frontend receives the same event structure.

**Rationale**: Eliminates the current pattern where `WebUiBackend` has `broadcast()` calls in 15+ methods. The WebSocket protocol becomes a transparent pipe for HarnessEventBus events. The frontend can subscribe to the same event names.

### Decision 6: SessionManager timer via turn events

**Chosen**: SessionManager subscribes to `turn:start` → `startActiveTimer()` and `turn:end` → `stopActiveTimer()`.

**Why not `agent_start`/`agent_end`**: The original bug is that `agent_start` fires once per conversation, but we need per-turn timer tracking. `turn:start`/`turn:end` fire on every turn, fixing the skipped-timer bug.

## Risks / Trade-offs

**[Risk] Event ordering sensitivity**: If a consumer depends on receiving events in a specific order (e.g., `turn:streaming:start` before `llm:text:delta`), and the subscriber is registered after another subscriber that might reorder, subtle breakage could occur.
→ **Mitigation**: Handlers are called in registration order. Backends register during construction before Harness starts emitting. The event sequence is deterministic.

**[Risk] Missed events during initialization**: If Harness emits events before a consumer finishes its constructor subscription setup, events are lost.
→ **Mitigation**: Harness creates the event bus in its constructor but doesn't emit until `run()` or user interaction. Consumers subscribe in their constructors, which complete before `run()` is called.

**[Risk] Large payloads on WebSocket**: Tool results can be large (images, file contents). Broadcasting every event to all WebSocket clients could saturate bandwidth.
→ **Mitigation**: Keep the existing throttling/batching logic for streaming deltas. Add a size cap for tool results in the WebSocket relay (truncate or omit if > N bytes). This is a pre-existing concern, not new to the event bus.

**[Trade-off] Debugging becomes harder with indirection**: Instead of `grep "this.ui\.thinkingDelta"` to find callers, you need to `grep "llm:thinking:delta"` to find both emitters and subscribers.
→ **Mitigation**: The event catalog is in a single file (`src/core/events.ts`). Tracing is `grep`-friendly. Logging in `emit()` can trace the full event flow.

## Migration Plan

**Phase 1: Create the event bus (0 breaking changes)**
1. Create `src/core/events.ts` with `HarnessEvent` type and `HarnessEventBus` class
2. Add `events: HarnessEventBus` to `Harness` constructor, expose in `HarnessAPI`
3. No emissions yet — just infrastructure

**Phase 2: Wire up consumers as subscribers**
4. `WebUiBackend` subscribes to events and mirrors them to WebSocket (duplicate — old methods still work)
5. `TuiBackend` subscribes to events (duplicate — old methods still work)
6. `SessionManager` subscribes to `turn:start`/`turn:end`

**Phase 3: Migrate emissions**
7. Replace `this.ui.*` calls in `bindEvents()` with `this.events.emit(...)`
8. Replace `this.ui.*` calls in `promptAndSave()` with events
9. Replace `this.ui.*` calls in config/MCP handlers with events
10. Remove SessionManager timer calls from Harness agent subscriptions

**Phase 4: Clean up**
11. Remove the now-unused methods from `UiBackend` interface
12. Remove the now-unused implementations from `TuiBackend` and `WebUiBackend`
13. Remove `onConfigChange` from `UiBackend`

**Rollback**: Each phase is independently testable. Phase 2 duplicates functionality so old code still works. Phase 3 can be reverted commit-by-commit.

## Open Questions

1. **Should `getPromptPermission` also become event-based?** **Resolved: No.** EventBus is unidirectional fire-and-forget; permission is request-response (Harness blocks waiting for a user decision). Making it event-based would require either a callback registry, a Promise map with requestId correlation, or a second reverse event channel — all for a single use case. Kept as one of the 4 direct methods on UiBackend. Not related to cross-session checkpoint/resume (pending permission state is serialized via session metadata regardless of whether the call is direct or event-based).

2. **Should tool result payloads be trimmed before WebSocket relay?** ~~Images in `tool:end` results can be several MB base64-encoded. The event bus itself preserves the full payload; the WebSocket relay layer should decide on truncation.~~ **Resolved**: WebSocket has no practical size limit (RFC supports 2^63-1 byte frames). The existing `broadcast()` calls already send the same payloads over the same socket — no new concern. No trimming needed. Same behavior as pre-event-bus.

3. **Do we need `turn:abort` to carry a reason?** **Resolved**: Yes. Add `reason: "user" | "system"` to the `turn:abort` event. `"user"` when the user clicks abort, `"system"` when the system initiates a shutdown/timeout. The frontend can use this to show appropriate messaging ("Cancelled" vs "Session interrupted").

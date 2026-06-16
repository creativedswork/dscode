## 1. Create HarnessEventBus (Phase 1: infrastructure, zero breaking changes)

- [x] 1.1 Create `src/core/events.ts` with `HarnessEvent` discriminated union type (all ~25 event types) and `HarnessEventBus` class with `on()`/`emit()` methods
- [x] 1.2 Add `events: HarnessEventBus` field to `Harness` constructor — create bus before any agent initialization
- [x] 1.3 Add `readonly events: HarnessEventBus` to `HarnessAPI` interface
- [x] 1.4 Export `HarnessEventBus` and `HarnessEvent` from `src/core/events.ts`
- [x] 1.5 Run `npm run typecheck` to verify no type errors introduced

## 2. Wire up consumers as subscribers (Phase 2: duplicate notifications, old methods still work)

- [x] 2.1 Add `harness.events.on(...)` subscriptions in `WebUiBackend` constructor for all relevant events (llm:*, tool:*, turn:*, processing:*, ui:*, config:change, mcp:state, session:*, message:user)
- [x] 2.2 Each WebUiBackend event handler broadcasts the corresponding WebSocket message to connected clients
- [x] 2.3 Add `harness.events.on(...)` subscriptions in `TuiBackend` constructor for all rendering-relevant events (llm:text:delta, llm:thinking:delta, tool:start, tool:end, ui:info, ui:error, ui:warning, processing:start/stop, ui:focus:editor, ui:conversation:clear, ui:image:pending, message:user)
- [x] 2.4 Each TuiBackend event handler calls the corresponding internal render method
- [x] 2.5 Add `harness.events.on("turn:start", ...)` in `SessionManager` to call `startActiveTimer()` — keep the original Harness-initiated timer calls for now (dual-trigger)
- [x] 2.6 Add `harness.events.on("turn:end", ...)` in `SessionManager` to call `stopActiveTimer()` — keep the original Harness-initiated timer calls for now (dual-trigger)
- [x] 2.7 Wire `events` into `WebUiBackend` and `TuiBackend` constructors (already available via `HarnessAPI`)
- [x] 2.8 Wire `events` into `SessionManager` (add constructor parameter or setter)
- [x] 2.9 Run `npm run typecheck` and verify no regressions

## 3. Migrate Harness emissions (Phase 3: switch from direct calls to events)

- [x] 3.1 In `bindEvents()`, replace all `this.ui.*` streaming calls (`thinkingDelta`, `textDelta`, `toolStart`, `toolEnd`) with `this.events.emit(...)` equivalents
- [x] 3.2 In `bindEvents()`, replace `this.ui.startAssistantMessage()` with `this.events.emit({ type: "turn:streaming:start" })`
- [x] 3.3 In `bindEvents()`, replace `this.ui.setProcessing(false)` with `this.events.emit({ type: "processing:stop" })`
- [x] 3.4 In `bindEvents()`, replace `this.ui.finishAssistantMessage()` with `this.events.emit({ type: "turn:end", stopReason, usage })`
- [x] 3.5 In `promptAndSave()`, emit `turn:start` before `agent.prompt()`; emit `turn:error` on non-retryable failure; emit `llm:retry` instead of `this.ui.addRetry(...)`; emit `ui:error` instead of `this.ui.addError(...)`
- [x] 3.6 In Harness user message handling, emit `message:user` and `processing:start` instead of `this.ui.addUserMessage(...)` and `this.ui.setProcessing(true)`
- [x] 3.7 In Harness vision/OCR pre-processing, emit `processing:start`/`processing:stop` and `ui:image:pending` instead of `this.ui.setProcessing(...)` and `this.ui.addPendingImage(...)`
- [x] 3.8 Replace `this.ui.onConfigChange?.()` registration with `this.events.emit({ type: "config:change", data })` via ConfigWatch onChange
- [x] 3.9 Replace `this.ui.pushMcpState?.()` with `this.events.emit({ type: "mcp:state", servers })` in MCP handlers
- [x] 3.10 Replace `this.ui.setMcpManager(mgr)` with direct field access (`this.mcpManager = mgr` — already public via HarnessAPI)
- [x] 3.11 Replace ad-hoc `this.ui.addInfo(...)` calls (MCP progress, turn length warning) with `this.events.emit({ type: "ui:info", ... })`
- [x] 3.12 Replace `this.ui.openMcpBrowser()` with `this.events.emit({ type: "mcp:browser:open" })`
- [x] 3.13 Replace `this.ui.clearConversationView()` with `this.events.emit({ type: "ui:conversation:clear" })`
- [x] 3.14 Replace `this.ui.focusEditor()` with `this.events.emit({ type: "ui:focus:editor" })`
- [x] 3.15 Remove SessionManager timer calls (`startActiveTimer`/`stopActiveTimer`) from Harness agent subscriptions — now handled by SessionManager's own event subscriptions
- [x] 3.16 Run `npm run typecheck` and verify no compile errors from removed ui method calls

## 4. Clean up UiBackend interface and implementations (Phase 4: remove old methods)

- [x] 4.1 Remove from `UiBackend` interface: `addUserMessage`, `thinkingDelta`, `textDelta`, `toolStart`, `toolEnd`, `startAssistantMessage`, `finishAssistantMessage`, `addInfo`, `addError`, `addWarning`, `addRetry`, `addPendingImage`, `clearConversationView`, `focusEditor`, `setProcessing`, `setMcpManager`, `pushMcpState`, `openMcpBrowser`, `onConfigChange`
- [x] 4.2 Verify `UiBackend` interface has exactly 4 methods: `start`, `waitForExit`, `shutdown`, `getPromptPermission`
- [x] 4.3 Remove old method implementations from `WebUiBackend` (bodies replaced by event handlers in step 2; old methods now dead code)
- [x] 4.4 Remove old method implementations from `TuiBackend` (bodies replaced by event handlers in step 2; old methods now dead code)
- [x] 4.5 Remove `broadcast()` helper methods from `WebUiBackend` if they are now only called from event handlers
- [x] 4.6 Remove `private ui` field from `Harness` if no longer needed (or keep for `start`/`waitForExit`/`shutdown`/`getPromptPermission` lifecycle calls)
- [x] 4.7 Run `npm run typecheck` and verify clean compilation
- [x] 4.8 Run `npm test` and verify all tests pass
- [ ] 4.9 Manual smoke test: start TUI mode, send a message, verify streaming + tool display works
- [ ] 4.10 Manual smoke test: start Web mode, connect browser, send a message, verify WebSocket events and UI rendering

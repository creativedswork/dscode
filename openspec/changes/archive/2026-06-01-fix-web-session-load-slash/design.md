## Context

The Web UI backend (`web-backend.ts`) has two code paths for loading a session:

1. **Sidebar path**: `handleSession()` directly handles `{ type: "session", action: "load", id }` WebSocket commands. It clears the conversation, rebuilds history via `buildConversationHistory()`, and sends a `ready` event. This works correctly.

2. **Slash command path**: `handleSlashCommand()` wraps slash command execution by creating a `mockTui` object and calling `executeSlashCommand()`. The `/session load` command in `commands.ts` calls `ctx.tui.replayMessages()` after loading, but `replayMessages` is missing from `mockTui`.

The TUI backend (`TuiApp`) has a `replayMessages` method that renders messages as text lines on the terminal. The web backend cannot use this approach — it must send structured `ConversationMessage[]` data over WebSocket so the React frontend can render them.

The correct web-side behavior already exists in `handleSession`: send `clear_conversation`, call `buildConversationHistory()`, send `ready` with messages. The fix is to wire this same flow into `mockTui.replayMessages`.

## Goals / Non-Goals

**Goals:**
- `/session load <id>` slash command works in Web UI without errors
- Loaded session messages display correctly in the conversation view
- Behavior matches the sidebar session load path exactly

**Non-Goals:**
- Refactoring the dual-path architecture (sidebar vs slash command)
- Changing the `UiBackend` interface to add a `replayMessages` contract
- Fixing any session load or replay issues outside the slash command Web UI path

## Decisions

### Decision 1: Capture `buildConversationHistory` reference in the mock closure

The `mockTui` currently has direct access to `this` (the `WebUiBackend` instance) for methods like `clearConversationView`. We'll do the same for `replayMessages`: call `this.clearConversationView()`, then `this.buildConversationHistory()`, then send a `ready` event.

**Rationale**: Minimal change — reuses existing private methods. No new exports or interface changes.

**Alternative considered**: Adding `replayMessages` to the `UiBackend` interface. Rejected because the web backend would still need to send messages over WebSocket (which `UiBackend` abstractions don't have access to), and this is a single-method bridge, not a new abstraction layer.

### Decision 2: Don't filter or transform messages in the mock

The `mockTui.replayMessages` receives `ctx.agent.state.messages` and passes them to `buildConversationHistory()` (which internally reads `agent.state.messages` anyway). We ignore the argument and delegate to the existing history builder.

**Rationale**: The argument (`ctx.agent.state.messages`) is already what `buildConversationHistory()` reads internally. Passing it explicitly wouldn't add value and could introduce edge cases if the state drifts between the time the argument is captured and the method executes.

## Risks / Trade-offs

- **Risk**: `buildConversationHistory()` is async (no await needed in its current implementation but the signature is `async`). Calling it without `await` is fine since we just want the returned array.
- **Trade-off**: The two paths remain separate, so future changes to session loading behavior must be applied in both places. This is an existing architectural concern, not introduced by this fix.

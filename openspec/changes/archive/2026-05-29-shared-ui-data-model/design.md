## Context

The current architecture has a clean `UiBackend` interface that both TUI and Web UI implement. However, the data models flowing through that interface are entirely stream-oriented — raw `text_delta`, `tool_start`, `tool_end` events. Each UI must independently:
1. Accumulate streaming deltas into coherent message objects
2. Track tool call lifecycle (start → end → mcpApp)
3. Manage permission prompt state
4. Build its own internal representation of `UIMessage` / `ToolCallEntry`

The Web UI has `web/src/types/index.ts` which is a manually-maintained copy of types from `src/ui/web/protocol.ts`, but with subtle differences (e.g., `SessionInfo` fields differ between the two files). When adding Image input support, the Web UI's `ClientCommand` and `ServerEvent` types needed updating in both files independently, and the TUI's `ConversationView` needed separate changes.

## Goals / Non-Goals

**Goals:**
- Single source of truth for all UI-facing data types (`UIMessage`, `ToolCallEntry`, `ConfigData`, `SessionInfo`, `McpServerInfo`, permission types)
- A pure `conversationReducer(state, event)` function that both UIs use — tested once, works everywhere
- Web UI's `web/src/types/index.ts` becomes a thin re-export of shared types (no manual copying)
- Protocol types (`ClientCommand`, `ServerEvent`) import shared base types
- Zero regression: existing TUI and Web UI behavior unchanged

**Non-Goals:**
- Changing the `UiBackend` streaming API contract (stream deltas still flow the same way)
- Abstracting UI rendering (each UI still owns its DOM/Terminal rendering)
- Changing the WebSocket wire format (protocol stays the same)
- A full UI framework or component library — this is purely about data models and state management

## Decisions

### Decision 1: `src/ui/shared/` as the shared module location

**Chosen**: Place shared types in `src/ui/shared/` with the following structure:
```
src/ui/shared/
  types.ts          — canonical UIMessage, ToolCallEntry, ContentBlock, PermissionPrompt, etc.
  reducer.ts        — conversationReducer(state, events) → state
```

**Why not put everything in `src/core/types.ts`?**

Technically it would work — TUI imports from core, Web UI imports via Vite alias — same outcome. The reason for a separate directory is a **build safety guardrail**:

- Web UI (`npm run build:web`) is an independent Vite project that reaches into `src/` via alias. If an aliased file imports Node APIs (`fs`, `path`, `@mariozechner/pi-agent-core`), Vite bundling breaks.
- `src/core/types.ts` sits alongside harness logic, model resolution, and other server internals. A future maintainer adding a helper import to `core/types.ts` won't realize they're breaking the Web build — the directory carries no signal that it's consumed by an external bundler.
- `src/ui/shared/` makes the constraint explicit through its location: **every file in this directory must be pure TypeScript with zero Node.js dependencies**. An illegal import stands out immediately in review.

The separation is not about architectural layering (shared is still within the dscode server source tree). It's a single-purpose guardrail for the cross-bundler import path.

### Decision 2: `conversationReducer` as the shared state machine

**Chosen**: A pure function `conversationReducer(prev: UIMessage[], event: ServerEvent) → UIMessage[]` that handles all the message accumulation logic currently duplicated in `App.tsx` (~150 lines of switch/case) and `ConversationView`.

The reducer handles:
- `assistant_start` → begin streaming message
- `thinking_delta` → append to thinking buffer
- `text_delta` → append to content
- `tool_start` → add pending tool entry
- `tool_end` → fill result on matching tool entry
- `mcp_app` → attach app info to matching tool
- `assistant_end` → finalize streaming message
- `user_message` → add user message
- `clear_conversation` → reset state
- `ready` → populate initial messages

**Alternatives considered**:
- Keep each UI doing it independently — defeats the purpose
- Use a class-based state manager — heavier, less testable than a pure function
- Use Immer or similar — unnecessary dependency for this scale

### Decision 3: Shared types module resolution for Web UI

**Chosen**: Configure Vite's `resolve.alias` to map `@dscode/shared` to `src/ui/shared/` so the Web frontend can import from the server-side shared module.

```ts
// vite.config.ts
resolve: {
  alias: {
    '@dscode/shared': path.resolve(__dirname, '../src/ui/shared'),
  }
}
```

**Alternatives considered**:
- Copy files during build — fragile, adds build step
- Symlinks — platform-dependent issues
- tsconfig paths — Vite doesn't use tsc for resolution

### Decision 4: Protocol types relationship

**Chosen**: `protocol.ts` retains `ClientCommand` and `ServerEvent` as discriminated unions (they are the wire format), but their member types (`ImageAttachment`, `ConversationMessage`, `SessionInfo`, etc.) are imported from `src/ui/shared/`. The Web UI's `web/src/types/index.ts` re-exports shared types and imports protocol-specific types from a shared location.

## Risks / Trade-offs

- **[Risk] Vite alias to `src/` breaks web build if shared module imports Node-specific code** → Mitigation: shared types module must be pure TypeScript types + pure functions with no Node.js dependencies (no `fs`, `path`, `process`)
- **[Risk] Changing `UIMessage` shape breaks TUI rendering** → Mitigation: TUI's `ConversationView` is refactored in lockstep; existing `replayMessages()` behavior preserved
- **[Risk] Protocol type changes break WebSocket compatibility** → Mitigation: wire format stays identical; only internal type definitions move
- **[Trade-off] `conversationReducer` needs to handle all event types** → this is actually the point — it becomes the canonical place where new event types are handled, so both UIs automatically gain support

## Why

Adding a feature like Image input requires touching 6+ files — the Web wire protocol, Web client types, Web App event handler, TUI ConversationView, TUI App, and the UiBackend interface — often resulting in TUI working but Web UI broken (or vice versa). The two UIs duplicate message/permission/config/session models without a shared source of truth.

## What Changes

- Introduce `src/ui/shared/` as a shared UI data model layer containing canonical TypeScript types and state-building utilities for conversation messages, tool calls, permissions, MCP state, and config data
- Web UI (`web/src/types/index.ts`) imports shared types instead of maintaining its own copies — eliminates type drift
- `UiBackend` interface evolves from a pure stream API to include a state snapshot query, allowing UIs to reconcile rather than manually reconstruct message trees from events
- TUI `ConversationView` adopts the same shared message model (`UIMessage`), replacing its internal `ContentBlock[]` / `ToolEntry` representations
- `protocol.ts` remains the wire format but imports shared types where possible
- Session/message serialization in `App.tsx` (the ~150 line `handleEvent` switch) extracts into a shared `conversation-reducer.ts` used by both Web and TUI
- Shared permission prompt model: single definition for `PermissionPrompt`, `PermOption`, decision flow
- Shared config data model: `ConfigData` defined once, imported by both clients

## Capabilities

### New Capabilities
- `shared-conversation-model`: Canonical `UIMessage`, `ToolCallEntry`, `ContentBlock` types and a pure `conversationReducer(state, event) → state` function consumed by both TUI and Web UI
- `shared-permission-model`: Canonical `PermissionPrompt`, `PermOption`, `PermissionDecision` types
- `shared-config-model`: Canonical `ConfigData`, `SessionInfo`, `McpServerInfo` types
- `shared-protocol-sync`: Protocol types (`ClientCommand`, `ServerEvent`) derive from shared models — single source of truth for wire format

### Modified Capabilities
- `web-frontend`: Replace local type definitions with imports from shared module; use shared reducer for message state
- `websocket-protocol`: Protocol types import from shared models where applicable; remove duplicated type definitions

## Impact

- `src/ui/shared/` — new directory
- `src/ui/web/protocol.ts` — import shared types, remove inline definitions
- `src/ui/backend.ts` — add optional `getState()` method for snapshot query
- `src/ui/web/web-backend.ts` — adopt shared reducer, expose state snapshot
- `src/ui/tui-app.ts` — adopt shared `UIMessage` / reducer
- `src/ui/conversation.ts` — refactor to use shared model
- `src/ui/tui-backend.ts` — no structural change (thin adapter)
- `web/src/types/index.ts` — replace with re-exports from shared module (or auto-generated)
- `web/src/components/App.tsx` — use shared reducer, simplified event handling
- `web/src/components/ChatView.tsx` — use shared `UIMessage` type
- Build: Web Vite config needs alias/path mapping to `src/ui/shared/`

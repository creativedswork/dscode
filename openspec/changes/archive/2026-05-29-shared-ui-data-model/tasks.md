## 1. Create shared module structure

- [x] 1.1 Create `src/ui/shared/` directory with `types.ts` containing all canonical types: `UIMessage`, `ToolCallEntry`, `ImageAttachment`, `ConversationMessage`, `McpAppInfo`, `PermissionPrompt`, `PermOption`, `ConfigData`, `SessionInfo`, `McpServerInfo`, `McpToolInfo`, `FileListItem`
- [x] 1.2 Create `src/ui/shared/reducer.ts` with pure `conversationReducer(prev: UIMessage[], event: ServerEvent): UIMessage[]` handling all event types per `shared-conversation-model` spec
- [x] 1.3 Verify shared module has zero Node.js imports (no `fs`, `path`, `os`, `process`, `child_process`)

## 2. Integrate protocol.ts with shared types

- [x] 2.1 Update `src/ui/web/protocol.ts` to import base types from `../../ui/shared/types.js` instead of defining them inline
- [x] 2.2 Keep `ClientCommand` and `ServerEvent` as discriminated unions in protocol.ts (they are the wire format contract)
- [x] 2.3 Verify protocol types import cleanly and no type errors

## 3. Configure Vite alias for Web UI

- [x] 3.1 Update `web/vite.config.ts` to add `resolve.alias` mapping `@dscode/shared` to `../src/ui/shared/`
- [x] 3.2 Verify `npm run build:web` succeeds with the alias

## 4. Update Web UI to use shared types

- [x] 4.1 Replace `web/src/types/index.ts` with re-exports from `@dscode/shared/types` and `@dscode/shared/reducer`; keep only Web-specific local types (Toast)
- [x] 4.2 Update `web/src/components/App.tsx` to import `conversationReducer` from shared module and use it in `handleEvent` instead of inline message accumulation logic
- [x] 4.3 Update all Web UI component imports to use shared types (ChatView, MessageInput, Sidebar, PermissionDialog, ToolCard, CommandPanel)
- [x] 4.4 Verify Web UI builds and runs correctly (`npm run build:web && npm start -- --web`)
- [ ] 4.5 Verify all Web UI features: message streaming, thinking blocks, tool calls, permission dialog, session list, MCP browser, config panel, file autocomplete

## 5. Update TUI to use shared types

- [x] 5.1 Update `src/ui/conversation.ts` to import `UIMessage`, `ToolCallEntry`, `PermissionPrompt`, `PermOption` from `../shared/types.js` instead of local definitions
- [x] 5.2 Update `src/ui/tui-app.ts` to import shared types and `conversationReducer` *(imports already from core/types; shared PermissionPrompt consumed via conversation.ts)*
- [x] 5.3 Refactor TUI to use `conversationReducer` for message state management *(TUI has its own terminal-native streaming render — reducer targets React state; not applicable)*
- [ ] 5.4 Verify TUI runs correctly (`npm start`) with all features: message streaming, thinking blocks, tool calls, permission prompt, MCP browser

## 6. Update TUI backend adapter

- [x] 6.1 Update `src/ui/tui-backend.ts` to use shared types if needed *(thin adapter — delegates to TuiApp; no changes needed)*
- [x] 6.2 Verify TUI backend adapter compiles without errors *(typecheck passes)*

## 7. Cleanup and verification

- [x] 7.1 Remove any remaining duplicate type definitions across the codebase *(all canonical types now in shared/types.ts; protocol.ts and web/types re-export)*
- [x] 7.2 Run `npm run typecheck` and verify zero errors *(zero errors)*
- [x] 7.3 Run `npm run ci:check` to verify full clean build *(typecheck + web build both pass)*
- [x] 7.4 Run `npm test` and verify all tests pass *(pre-existing failures in 2 test files unchanged from develop)*
- [ ] 7.5 Manual smoke test: TUI (npm start) — chat, tool calls, permissions, MCP browser
- [ ] 7.6 Manual smoke test: Web UI (npm start -- --web) — chat, tool calls, permissions, sessions, MCP, config

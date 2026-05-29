## ADDED Requirements

### Requirement: Protocol types import from shared module
The WebSocket protocol types in `src/ui/web/protocol.ts` SHALL import base types (`ImageAttachment`, `ConversationMessage`, `ToolCallEntry`, `McpAppInfo`, `SessionInfo`, `ConfigData`, `McpServerInfo`, `McpToolInfo`, `FileListItem`) from the shared module rather than defining them inline.

#### Scenario: protocol.ts imports shared types
- **WHEN** `protocol.ts` is compiled
- **THEN** all non-union base types are imported from `../../ui/shared/types.js`

#### Scenario: ClientCommand and ServerEvent remain discriminated unions
- **WHEN** the protocol is inspected
- **THEN** `ClientCommand` and `ServerEvent` are still defined in `protocol.ts` as discriminated unions since they are the wire format contract

### Requirement: Web client types are thin re-exports
The Web UI's `web/src/types/index.ts` SHALL be replaced with re-exports from the shared module and protocol types, eliminating all duplicate type definitions.

#### Scenario: Web types file structure
- **WHEN** `web/src/types/index.ts` is inspected
- **THEN** it contains only `export type { ... } from '@dscode/shared/types'` and `export type { ... } from '@dscode/shared/protocol-types'` re-exports, plus Web-specific local types like `UIMessage` (which is also imported from shared)

### Requirement: Shared module has no Node.js dependencies
All files in `src/ui/shared/` SHALL be pure TypeScript with no imports from Node.js built-in modules (`fs`, `path`, `os`, `process`, `child_process`, etc.).

#### Scenario: Vite resolves shared module
- **WHEN** `npm run build:web` executes
- **THEN** Vite successfully resolves and bundles types from `src/ui/shared/` without Node.js API errors

### Requirement: Type compatibility preserved
The wire format of all WebSocket messages SHALL remain identical before and after the refactor. JSON serialization of `ServerEvent` and `ClientCommand` MUST produce the same output.

#### Scenario: Protocol backward compatibility
- **WHEN** the refactored server sends a `ready` event
- **THEN** the JSON structure matches the pre-refactor format exactly (same keys, same value types)

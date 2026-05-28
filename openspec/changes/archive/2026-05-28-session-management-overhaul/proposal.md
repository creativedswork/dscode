## Why

Session management currently treats all sessions as a flat global list across all projects, has weak error handling that silently swallows failures, and provides minimal information when listing or loading sessions — making it hard for users to identify and resume the right session.

## What Changes

- **Project-scoped sessions**: Sessions are partitioned by project directory (cwd). Each project sees only its own sessions. A global "all projects" view is optionally available.
- **Robust error handling**: Validate session file integrity on load, surface clear error messages for corrupted/missing sessions, and add defensive checks throughout the save/load/delete lifecycle.
- **Rich session display**: `/session list` and `/session load` show model info, project path, creation time, last activity time, and a content preview snippet — giving users enough context to confidently identify and resume sessions.
- **Session metadata enhancements**: Add `projectPath` field to `SessionMetadata` for scoping. Add `createdAt` display alongside `updatedAt`.
- **Web UI parity**: Web session list/load mirrors the enhanced TUI display with the same rich metadata.

## Capabilities

### New Capabilities
- `session-project-scoping`: Sessions are stored per-project and filtered by cwd. Session metadata includes `projectPath`.
- `session-error-handling`: Validate session files on load, surface corruption errors, handle edge cases (empty files, partial writes, invalid JSON).
- `session-rich-display`: Enhanced `/session list` and `/session load` output with model provider/ID, project path, creation time, activity time, message preview.

### Modified Capabilities
<!-- No existing session specs to modify -->

## Impact

- `src/session/store.ts` — project-scoped directory layout, validation on load, atomic write hardening
- `src/session/manager.ts` — projectPath parameter, enhanced list/load return types
- `src/core/types.ts` — `SessionMetadata` gains `projectPath`
- `src/core/harness.ts` — passes `projectPath` to SessionManager
- `src/ui/commands.ts` — enhanced `/session list` and `/session load` display
- `src/ui/web/web-backend.ts` — enriched `SessionInfo` with project path, model info, preview
- `src/ui/web/protocol.ts` — `SessionInfo` type gains new fields

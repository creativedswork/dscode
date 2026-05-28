## 1. Data model & types

- [x] 1.1 Add `projectPath: string` and `preview: string` to `SessionMetadata` in `src/core/types.ts`
- [x] 1.2 Add `SessionInfo` type extension in `src/ui/web/protocol.ts` with `modelProvider`, `modelId`, `projectPath`, `preview`, `createdAt` fields

## 2. Store layer: project-scoped storage

- [x] 2.1 Add `projectSlug(projectPath: string): string` static helper to `SessionStore` using path sanitization + SHA-256 prefix
- [x] 2.2 Update `SessionStore` constructor to accept `projectPath` and derive the project-specific directory under `sessions/by-project/<slug>/`
- [x] 2.3 Update `save()` to write to project-specific directory AND update both the project `index.json` and the global `sessions/index.json`
- [x] 2.4 Update `load()` to read from project-specific directory first, fall back to global `sessions/` for unscoped sessions
- [x] 2.5 Update `list()` to return only project-scoped sessions by default; add `listAll()` for the global `--all` view
- [x] 2.6 Update `delete()` to remove from both project index and global index; clean up empty project directories

## 3. Store layer: error handling & validation

- [x] 3.1 Add `validateSession(data: unknown): SerializedSession` method that checks structure, required fields, and ID match; throws descriptive errors on failure
- [x] 3.2 Harden `save()`: remove direct-write fallback, only use atomic write (tmp + rename); throw on failure instead of returning false
- [x] 3.3 Update `load()` to call `validateSession()` and surface errors; never silently return null
- [x] 3.4 Add index rebuild logic in `list()`: if `index.json` is missing or corrupted, scan `.json` files in the directory and rebuild
- [x] 3.5 Update `delete()` to report "not found" when session ID doesn't exist

## 4. Manager layer

- [x] 4.1 Update `SessionManager` constructor to accept `projectPath` and pass it to `SessionStore`
- [x] 4.2 Update `createSession()` to set `projectPath` and `preview` on metadata
- [x] 4.3 Update `saveSession()` to extract preview from first user message (first 80 chars) and set it on metadata before saving
- [x] 4.4 Update `loadSession()` to propagate validation errors from store to caller as structured error results
- [x] 4.5 Add `listAllSessions()` method for the global `--all` view
- [x] 4.6 Change return type of `loadSession()` from `boolean` to `{ success: boolean; error?: string }` for error propagation

## 5. CLI commands: rich display

- [x] 5.1 Rewrite `/session list` to show rich format: `id[:8] "title" provider/modelId YYYY-MM-DD HH:MM N msgs` with project path header
- [x] 5.2 Rewrite `/session load` output to show full session details (ID, title, model, project, created, activity, message count)
- [x] 5.3 Add ambiguous prefix detection in `/session load`: if multiple sessions match the prefix, list them instead of loading
- [x] 5.4 Add `/session list --all` to show sessions from all projects
- [x] 5.5 Update error messages in commands to use structured errors from manager

## 6. Harness integration

- [x] 6.1 Pass `config.projectPath` to `SessionManager` constructor in `Harness`
- [x] 6.2 Update shutdown/emergency save calls to use new save API (no behavior change needed, just type alignment)

## 7. Web backend parity

- [x] 7.1 Update `handleSession()` list action to include `modelProvider`, `modelId`, `projectPath`, `preview`, `createdAt` in `SessionInfo`
- [x] 7.2 Update `handleSession()` load action to resync conversation and send enriched session info to client
- [x] 7.3 Update `handleSession()` delete action to propagate errors from manager

## 8. Backward compatibility

- [x] 8.1 Ensure unscoped sessions (no `projectPath` in metadata) are readable via `load()` with fallback to global directory
- [x] 8.2 Ensure `listAll()` includes unscoped sessions alongside project-scoped ones
- [x] 8.3 When an unscoped session is re-saved, adopt the current project's `projectPath` and move it to the project directory

## 1. Fix `handleSession` load handler

- [x] 1.1 In `src/ui/web/web-backend.ts`, in `handleSession` `"load"` case, after line `if (matches.length === 0)` and before returning "Session not found" error, add fallback: check if `sessionManager.getCurrentMetadata()?.id.startsWith(cmd.id!)`. If so, set `match` to the current metadata and proceed with load flow.
- [x] 1.2 Verify via unit or manual test: create a new session, click it in sidebar — should load successfully without "Session not found" error.

## 2. Fix `rebuildIndex` empty-message filtering

- [x] 2.1 In `src/session/store.ts` `rebuildIndex()`, remove the condition `Array.isArray(raw.messages) && raw.messages.length > 0` that guards pushing to `entries`. Push as long as `raw?.metadata && typeof raw.metadata.id === "string"`.
- [x] 2.2 Verify via unit or manual test: delete `index.json`, restart — 0-message sessions should still appear in the index (though filtered from the sidebar by `listSessions()`).

## 3. Validation

- [x] 3.1 Run `npm test` to ensure existing tests pass.
- [x] 3.2 Run `npm run typecheck` to ensure no type errors.

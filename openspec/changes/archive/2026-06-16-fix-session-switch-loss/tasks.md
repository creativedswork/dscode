## 1. Protocol: sessions event extension

- [x] 1.1 Add `isProcessing?: boolean` to `ServerEvent` `sessions` type in `src/ui/shared/types.ts`
- [x] 1.2 Add `isProcessing` to `pushSessionList` method in `src/ui/web/web-backend.ts`, derived from a tracking field (e.g., `this._processing` boolean set in `setProcessing`)
- [x] 1.3 In `pushSessionList`: when current session has `messageCount === 0`, include it in the data array alongside `currentSessionId` (so sidebar can still highlight the active session even though `listSessions()` filtered it out)

## 2. Server: load path abort-save-load

- [x] 2.1 Add `private _processing: boolean = false` field to `WebUiBackend`, set to `true` in `setProcessing(true)` and `false` in `setProcessing(false)`
- [x] 2.2 In `handleSession` → `load` case: before loading, save current session regardless of message count — `harness.saveSessionNow()` persists even a 0-msg session so it stays in the sidebar
- [x] 2.3 Add `this.pushSessionList(client)` call after the load + ready sequence so the sidebar updates with the saved current session
- [x] 2.4 Ensure `pushSessionList` includes `currentSessionId` from `sessionManager.getCurrentSessionId()` and `isProcessing` from `this._processing`

## 3. Server: `/session load` slash command alignment

- [x] 3.1 Extract shared `doLoadSession(client, sessionId)` method in `WebUiBackend` that performs abort→save→load→clear→ready→pushSessionList sequence
- [x] 3.2 Refactor `handleSession` → `load` case to call `doLoadSession`
- [x] 3.3 Update `handleSlashCommand` → `/session load <id>` path to call `doLoadSession` instead of the current inline logic

## 4. Session Manager: zero-message session lifecycle

- [x] 4.1 In `src/session/manager.ts` `createSession()`: before generating new ULID, scan `listSessions()` for any session with `messageCount === 0` in current project; if found, reuse its `id` and `createdAt`, update `updatedAt`, `modelProvider`, `modelId`
- [x] 4.2 In `src/session/manager.ts` `persistEmptySession()`: before writing, scan the project directory for other session files with `messageCount === 0` (parse metadata) and delete them, excluding the current session
- [x] 4.3 In `src/session/manager.ts` `listSessions()`: filter out sessions where `messageCount === 0` from the returned array
- [x] 4.4 Update `pushSessionList` in `web-backend.ts`: after filtering with `listSessions()`, if the current session has `messageCount === 0`, append it back so the sidebar can highlight it as active

## 5. Frontend: session list running indicator

- [x] 5.1 Import `Spinner` from `@phosphor-icons/react` in `Sidebar.tsx`
- [x] 5.2 Add `isProcessing: boolean` prop to `Sidebar` component and `SessionsPanel`
- [x] 5.3 In `SessionsPanel`, when `session.id === currentSessionId && isProcessing`, render `<Spinner>` with CSS animation class `animate-spin` at opacity 0.6, color `var(--color-accent)`, size 14
- [x] 5.4 Define CSS keyframe `@keyframes spin` in `index.css` if not already present (or use Tailwind `animate-spin`)

## 6. Frontend: event handling fixes

- [x] 6.1 In `App.tsx` `handleEvent`, `clear_conversation` case: add `setProcessing(false)` as defensive reset
- [x] 6.2 In `App.tsx` `handleEvent`, `sessions` case: extract `isProcessing` from event and pass to `Sidebar`; update `currentSessionId` from `event.currentSessionId` explicitly rather than relying on `(event as any).currentSessionId`
- [x] 6.3 In `App.tsx`, pass `isProcessing` state (or extract from the sessions event data) as prop to `Sidebar`

## 7. Validation

- [x] 7.1 Run `npm run typecheck` and fix any type errors
- [x] 7.2 Run `npm test` and ensure existing tests pass
- [ ] 7.3 Manual test: start a long-running prompt, click a history session, verify current session appears in sidebar list, verify no streaming output leaks into the new session, verify spinner shows/hides correctly
- [ ] 7.4 Manual test: run `/session load <id>` while processing, verify same abort→save→load behavior
- [ ] 7.5 Manual test: click "New Session" multiple times without typing, verify sidebar shows exactly 1 session (not N copies)
- [ ] 7.6 Manual test: after sending a message in a session, click "New Session", verify the previous session is saved with a title in the list and the new session reuses no prior empty session

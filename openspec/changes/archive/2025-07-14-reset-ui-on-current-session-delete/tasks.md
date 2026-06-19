## 1. SessionManager: clear current on delete

- [x] 1.1 In `src/session/manager.ts` `deleteSession()`, add guard before `this.events?.emit`: if `id === this.current?.id`, set `this.current = null`

## 2. WebUiBackend: event subscription + delete handler

- [x] 2.1 In `src/ui/web/web-backend.ts` constructor, subscribe to `session:deleted` event calling `pushSessionListToAll()` (mirroring `session:saved` and `session:created` handlers)
- [x] 2.2 In `src/ui/web/web-backend.ts` `handleSession` delete case: capture `wasCurrent` before `deleteSession()`, send `clear_conversation` if `wasCurrent`, include `currentSessionId` in `sessions` response

## 3. Typecheck and manual verification

- [x] 3.1 Run `npm run typecheck` to verify no type errors
- [x] 3.2 Manual test: create a session, send a message, delete it from sidebar → verify ChatView shows welcome page
- [x] 3.3 Manual test: create two sessions, switch to session A, delete session B from sidebar → verify ChatView still shows session A messages and sidebar highlights A

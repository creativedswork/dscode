## 1. Add replayMessages to mockTui

- [x] 1.1 In `handleSlashCommand` in `src/ui/web/web-backend.ts`, add `replayMessages` to the `mockTui` object literal, implemented as a method that calls `this.clearConversationView()`, then `this.buildConversationHistory()`, then sends a `ready` event over the client WebSocket with the rebuilt messages and current model/config

## 2. Verify

- [x] 2.1 Run `npm run typecheck` to confirm no type errors introduced
- [x] 2.2 Manual smoke test: start Web UI, save a session, type `/session load <id>`, confirm messages appear correctly and no error occurs

## 1. Server: Push session list at end of each assistant turn

- [x] 1.1 In `web-backend.ts`, call `pushSessionList` from `finishAssistantMessage()` using broadcast (via `this.wsServer.broadcast` or a refactored broadcast helper)
- [x] 1.2 Verify `finishAssistantMessage` does not have access to `client` — use broadcast pattern (`this.wsServer.broadcast`) or extract session data and use `WsServer.broadcast`
- [x] 1.3 Ensure `pushSessionList` still works with its existing `client.send()` call sites (connect, chat, slash, session ops) — do not break those paths

## 2. Client: Block delete button on active session during processing

- [x] 2.1 In `Sidebar.tsx` `SessionsPanel`, change delete button's `onClick` guard from `!isDisabled` to `!isDisabled && !isProcessing`
- [x] 2.2 Verify delete button hover state: delete button should not appear on hover for ANY session row during processing

## 3. Verify end-to-end

- [ ] 3.1 Manual test: send a prompt, observe session list message count increment after each assistant turn (not just at end)
- [ ] 3.2 Manual test: during agent run, hover over the active session row — delete button is not visible/clickable
- [ ] 3.3 Manual test: during agent run, hover over a non-active session row — delete button is not visible/clickable
- [ ] 3.4 Manual test: after agent completes, all delete buttons are functional again
- [x] 3.5 Run `npm run typecheck` and `npm test` to verify no regressions

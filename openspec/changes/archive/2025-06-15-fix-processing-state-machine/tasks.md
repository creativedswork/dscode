## 1. Client: Fix processing state machine in App.tsx

- [x] 1.1 Remove `setProcessing(false)` from `assistant_end` case in `handleEvent`
- [x] 1.2 Remove `setProcessing(false)` from `clear_conversation` case in `handleEvent`
- [x] 1.3 Remove `setProcessing(true)` from `assistant_start` case in `handleEvent`
- [x] 1.4 Verify `processing` is now controlled only by `handleSend`, `loader` event, and `error` event

## 2. Server: Fix permission_response fall-through in web-backend.ts

- [x] 2.1 Add `break` after `case "permission_response"` block in `handleMessage`

## 3. Server: Fix handleSlashCommand race condition in web-backend.ts

- [x] 3.1 Add `await` to `this.harness.promptAndSave(text)` call in the `!executed` fallback branch of `handleSlashCommand`
- [x] 3.2 Move `loader: hide` send to after `promptAndSave` completes (or ensure it only fires for non-agent paths)

## 4. Verify end-to-end

- [ ] 4.1 Manual test: send a prompt, verify Stop button stays visible through thinking → tools → text until agent completes
- [ ] 4.2 Manual test: verify session switching is locked (non-active sessions dimmed, unclickable) during entire agent run
- [ ] 4.3 Manual test: verify Stop button reverts to Send and session switching unlocks after agent completes
- [ ] 4.4 Manual test: verify Stop button reverts to Send on error
- [ ] 4.5 Manual test: verify `/reset` properly clears conversation without leaving processing in wrong state
- [ ] 4.6 Manual test: verify abort (Stop button click) correctly stops agent and unlocks UI
- [x] 4.7 Run `npm run typecheck` and `npm test` to verify no regressions

## 1. Data model: SessionMetadata + protocol types

- [x] 1.1 Add `pendingPermission` optional field to `SessionMetadata` in `src/core/types.ts`
- [x] 1.2 Add `pendingPermission` optional field to `SessionInfo` in `src/ui/web/protocol.ts`
- [x] 1.3 Run `npm run typecheck` to verify type consistency

## 2. Session save: rollback + persist pending permission

- [x] 2.1 In `SessionManager.saveSession`, accept optional `pendingPermission` parameter and write it to metadata
- [x] 2.2 In `SessionManager.saveSession`, when `pendingPermission` is provided, roll back the last partial assistant message from the message list before serializing (remove last message where `role === "assistant"` and content contains a `tool_use` block)
- [x] 2.3 In `SessionManager.saveSession`, when `pendingPermission` is NOT provided, do NOT store `pendingPermission` in metadata (ensure it's `undefined`)

## 3. Web backend: save with pending permission on session switch

- [x] 3.1 In `WebUiBackend.handleSession` load case, when `permissionResolve` is non-null before abort: capture `{ toolName, preview, fuzzyPattern, permissionArgs }` from current state
- [x] 3.2 Pass captured pending permission to `saveSessionNow` (via `sessionManager.saveSession(agent, pendingPermission)` or a new overload)
- [x] 3.3 Ensure `pushSessionList` (called after load) picks up `pendingPermission` from metadata via `getCurrentMetadata()`

## 4. Server-side push: include pendingPermission in sessions event

- [x] 4.1 In `pushSessionList`, map `SessionMetadata.pendingPermission` into `SessionInfo.pendingPermission`
- [x] 4.2 In `finishAssistantMessage` sessions broadcast, also include `pendingPermission`

## 5. Frontend: auto-detect and show PermissionDialog

- [x] 5.1 In `App.tsx` `handleEvent`, in `sessions` case: after setting currentSessionId, check if the current session has `pendingPermission` and set permission prompt state
- [x] 5.2 Ensure `setPermissionPrompt` state shape matches what `PermissionDialog` expects (toolName, preview, fuzzyPattern)
- [x] 5.3 Ensure PermissionDialog closes when user switches away (existing `clear_conversation` handler clears `permissionPrompt`)

## 6. Frontend: handle Allow/Deny on restored permission

- [x] 6.1 On "Allow" click in restored PermissionDialog: send `{ type: "permission", decision: "allow" }` and add pre-approve info so backend can auto-allow the same tool
- [x] 6.2 On "Deny" click: send command to clear `pendingPermission` and save session without it
- [x] 6.3 Frontend dismisses PermissionDialog after either action

## 7. Backend: handle restored permission response

- [x] 7.1 On Allow from restored permission: add session grant for the tool, then re-trigger agent from last user message via `harness.promptAndSave(lastUserText)`
- [x] 7.2 On Deny from restored permission: clear `pendingPermission` in metadata and save session
- [x] 7.3 Ensure no duplicate agent runs or permission loops

## 8. Verify

- [x] 8.1 `npm run typecheck` passes
- [x] 8.2 `npm test` passes (no regressions)
- [x] 8.3 Manual test: start agent → tool permission pops → switch session → switch back → permission dialog auto-appears → Allow → agent continues
- [x] 8.4 Manual test: same flow but click Deny → no permission dialog on next switch-back
- [x] 8.5 Manual test: verify conversation history is clean (no partial assistant message "air bubble") after switching back

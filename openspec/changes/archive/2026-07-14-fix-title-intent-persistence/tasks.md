## 1. Rename and refactor titleIntent in session/manager.ts

- [x] 1.1 Rename `pendingTitleHint` → `titleIntent` (module-level variable)
- [x] 1.2 Rename `setPendingTitleHint` → `setTitleIntent` (exported function)
- [x] 1.3 Refactor `extractSessionTitle`: move Pass 1 before titleIntent check; titleIntent only cleared when Pass 1 finds a qualifying human message
- [x] 1.4 Keep `isTitleBetter` unchanged

## 2. Update call sites

- [x] 2.1 Update `src/ui/tui-app.ts`: import `setTitleIntent`, call `setTitleIntent(args)` at line 1277
- [x] 2.2 Update `src/ui/web/web-backend.ts`: import `setTitleIntent`, call `setTitleIntent(cmdArgs)` at line 723

## 3. Tests

- [x] 3.1 Add test: titleIntent survives multiple `extractSessionTitle` calls when no real human message exists
- [x] 3.2 Add test: titleIntent cleared when Pass 1 finds a real non-command human message
- [x] 3.3 Add test: titleIntent takes priority over Pass 2 (command argument)
- [x] 3.4 Add test: Pass 1 takes priority over titleIntent
- [x] 3.5 Add test: title not overwritten by injected system instruction text across multiple saves

## 4. Verification

- [x] 4.1 Run `npm run typecheck` to ensure no type errors
- [x] 4.2 Run `npm test` to ensure all existing tests pass
- [ ] 4.3 Manual smoke test: open /opsx:explore session, verify title uses command args, not injected instruction body

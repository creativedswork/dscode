## 1. Core: Glob matching in PermissionManager

- [x] 1.1 Add `compileToolPattern()` to `PermissionManager` that compiles `*` glob to `RegExp`, return null for patterns without wildcards
- [x] 1.2 Add `patternCache: Map<string, RegExp>` to `PermissionManager` for compiled regex caching
- [x] 1.3 Modify `evaluate()` to check exact match first, then glob match via compiled patterns, then `*` global
- [x] 1.4 Unit tests for glob matching: server wildcard `mcp__lsp__*`, mid-name `mcp__*__search`, no wildcard exact match, global `*`

## 2. Core: Claude Code allow/deny format in config.ts

- [x] 2.1 In `loadConfig()`, parse `permissions.allow` string array into `PermissionRuleConfig[]` with `decision: "allow", priority: 5`
- [x] 2.2 Parse `permissions.deny` string array into `PermissionRuleConfig[]` with `decision: "deny", priority: 5`
- [x] 2.3 Merge with existing `permissions.rules` array, preserving explicit priorities
- [x] 2.4 Unit tests for config parsing: allow-only, deny-only, mixed formats, empty permissions, no permissions key

## 3. Core: PersistRule writes allow/deny format

- [x] 3.1 Refactor `persistRule()` to write to `permissions.allow` or `permissions.deny` array instead of `rules` array
- [x] 3.2 Ensure no duplicates on append
- [x] 3.3 Preserve existing `rules` array on write (don't delete it)
- [x] 3.4 Unit test: persistRule writes to allow array, handles existing entries, deny writes to deny array

## 4. Shared types: Wire protocol and PermOption extension

- [x] 4.1 Add `"always_allow_save"` to `PermOption.value` in `src/ui/shared/types.ts`
- [x] 4.2 Add `"always_allow_save"` to `ClientCommand.permission.decision` in wire protocol
- [x] 4.3 Remove `"explain"` / `"Input Idea"` from TUI `PermOptionValue` (align with `shared/types.ts`)

## 5. TUI: Permission dialog with save option

- [x] 5.1 Update `PERM_OPTIONS` in `src/ui/conversation.ts`: remove Input Idea, add `{ value: "always_allow_save", label: "Save as Rule", key: "s" }`
- [x] 5.2 Update `applyPermissionOption()` in `src/ui/tui-app.ts` to handle `"always_allow_save"`: resolve with `persistRule: {tool, decision: "allow"}` + `rememberForSession: true`
- [x] 5.3 Handle `persistRule` in the TUI's `resolvePermissionChoice` path (the existing `persistRule` handling in `PermissionManager.check()` should already work for the returned result)

## 6. Web UI: Permission dialog with save button

- [x] 6.1 Update `PermissionDialog.tsx` to add "Save as Rule" button, wired to `onDecision("always_allow_save")`
- [x] 6.2 Update `web-backend.ts` case `"permission"` to handle `"always_allow_save"`: set `persistRule` with the current tool name
- [x] 6.3 Ensure `App.tsx` `onDecision` prop type allows `"always_allow_save"`

## 7. Integration & validation

- [x] 7.1 Manual test: TUI prompt shows 4 options, "always_allow_save" writes to settings.json
- [x] 7.2 Manual test: Web UI prompt shows 4 buttons, "Save as Rule" writes to settings.json
- [x] 7.3 Manual test: settings.json with `"allow": ["mcp__lsp__*"]` grants all LSP tools
- [x] 7.4 Verify no regressions: existing `rules` format still works, session grants still exact-match only
- [x] 7.5 Run `npm test` and `npm run typecheck`

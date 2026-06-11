## 1. Shared types & protocol

- [x] 1.1 Add optional `toolNamePattern: string` field to `ClientCommand.permission` in shared types
- [x] 1.2 Add optional `toolNamePattern` parameter to `persistRule` function signature
- [x] 1.3 Update `PermissionPromptResult` to carry `toolNamePattern` when fuzzy is selected

## 2. Fuzzy pattern derivation

- [x] 2.1 Add `deriveFuzzyPattern(toolName: string): string | null` — for MCP tools (`mcp__<server>__<rest>`) returns `mcp__<server>__*`, otherwise `null`
- [x] 2.2 Add `fuzzyPattern` to `PermissionPrompt` type so UI can display it

## 3. PermissionManager persistRule changes

- [x] 3.1 Update `persistRule()` to accept optional `toolNamePattern` override
- [x] 3.2 When `toolNamePattern` provided, write it to `permissions.allow`/`permissions.deny` instead of prompt tool name
- [x] 3.3 Skip appending if `toolNamePattern` already exists in the target array

## 4. TUI permission prompt

- [x] 4.1 When user presses `s` and `fuzzyPattern` exists, show sub-options: `[1] exact: <tool>` / `[2] fuzzy: <pattern>`
- [x] 4.2 Key `1` saves exact name, key `2` saves fuzzy pattern, Escape returns to main prompt
- [x] 4.3 When `fuzzyPattern` is null, `s` saves exact name immediately (no sub-menu)
- [x] 4.4 Wire result into `PermissionPromptResult` with appropriate `toolNamePattern`

## 5. Web permission dialog

- [x] 5.1 When user clicks "Save as Rule" and `fuzzyPattern` exists, expand to show "Exact" and "Fuzzy" buttons
- [x] 5.2 Click "Exact" → send persist without `toolNamePattern`
- [x] 5.3 Click "Fuzzy" → send persist with `toolNamePattern`
- [x] 5.4 When `fuzzyPattern` is null, "Save as Rule" saves exact name immediately (no expansion)

## 6. Integration & cleanup

- [x] 6.1 Ensure "Always Allow (save)" exact path works identically to before — no regression
- [x] 6.2 Ensure session grants (`sessionGrants`) remain exact match only
- [x] 6.3 End-to-end: prompt `mcp__playcanvas__create_scene` → save fuzzy `mcp__playcanvas__*` → next `mcp__playcanvas__delete_scene` call auto-allowed

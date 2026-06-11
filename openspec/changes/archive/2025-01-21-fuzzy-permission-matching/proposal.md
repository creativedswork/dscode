## Why

The permission tool's "Always Allow (save)" only saves exact tool name matches (e.g., `mcp__playcanvas__create_scene`). When a different tool from the same MCP server is invoked, the user must re-grant permission. Users want to save a fuzzy pattern like `mcp__playcanvas__*` directly from the permission prompt — without manual editing or opening settings.json.

## What Changes

- When user selects "Always Allow (save)", present **two options**: exact (`mcp__playcanvas__create_scene`) and fuzzy (`mcp__playcanvas__*`)
- The fuzzy pattern is **auto-derived** from the tool name structure — no manual editing needed
- For MCP tools (`mcp__<server>__<tool>`), the fuzzy pattern is `mcp__<server>__*`
- For non-namespaced tools (e.g., `bash`, `read_file`), only the exact option is shown (no fuzzy)
- TUI: pressing `s` shows exact/fuzzy sub-options; user picks one with a key
- Web: "Save as Rule" expands to show two buttons: "Exact" and "Fuzzy (`mcp__<server>__*`)"

## Capabilities

### New Capabilities

- `permission-fuzzy-save`: Auto-derived fuzzy pattern option in the "Always Allow (save)" flow. System derives the fuzzy pattern from the tool name and presents it alongside the exact option as a simple two-way choice.

### Modified Capabilities

- `permission-persist-ui`: "Always Allow (save)" now expands to a two-option choice (exact / fuzzy) instead of immediately saving the exact name. The persist payload carries the selected pattern.
- `claude-code-permission-format`: `persistRule` now accepts an optional `toolNamePattern` override — when provided, it is written to settings instead of the prompt's exact tool name.

## Impact

- **TUI**: permission prompt key handler — `s` expands to sub-options
- **Web**: `PermissionDialog` — "Save as Rule" expands to two buttons
- **Shared types**: `PermissionPrompt` may carry an optional `fuzzyPattern: string` field
- **Wire protocol**: `ClientCommand.permission` may need a `toolNamePattern` field
- **PermissionManager**: `persistRule()` accepts optional pattern override

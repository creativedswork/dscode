## Why

The MCP tool naming convention uses `__` (double underscore) as the delimiter between namespace, server name, and tool name — e.g., `mcp__lsp__textDocument_hover`. This is the unambiguous format referenced in existing specs (`tool-name-glob`, `permission-persist-ui`, `permission-project-persist`). However, the implementation constructs tool names with single `_` separators (`mcp_lsp_textDocument_hover`), making it impossible to reliably extract the server name from a tool name when either component contains underscores. This blocks features like server-level permission patterns (`mcp__playcanvas__*`) and breaks the grouping logic in the discoverable tools hint.

## What Changes

- **BREAKING**: Change MCP tool name separator from single `_` to double `__` in all construction sites in `src/mcp/manager.ts`
- Change MCP driver name separator from single `_` to double `__`
- Update prefix extraction logic in `src/drivers/tool-registry.ts` to split on `__` instead of `_`
- No change to the MCP wire protocol — only the internal tool naming is affected
- Existing persisted permission rules that use the old single-underscore format will need manual migration (documented in design)

## Capabilities

### Modified Capabilities
None. Existing specs (`tool-name-glob`, `permission-persist-ui`, `permission-project-persist`) already use `mcp__<server>__<tool>` naming in their scenarios — this change aligns the implementation with the specs.

## Impact

- `src/mcp/manager.ts`: 6 lines (tool name and driver name construction)
- `src/drivers/tool-registry.ts`: 1 location (prefix extraction for discoverable tools hint grouping)
- All permission rules persisted with single-underscore tool names will stop matching. Users with saved MCP tool permissions in `.dscode/settings.json` will need to re-save them.

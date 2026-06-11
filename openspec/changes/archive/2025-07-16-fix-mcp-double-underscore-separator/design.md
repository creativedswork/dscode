## Context

The MCP tool naming convention uses `__` (double underscore) as the delimiter: `mcp__<server>__<tool>`. This pattern is already documented in existing specs (`tool-name-glob`, `permission-persist-ui`, `permission-project-persist`), but the implementation in `src/mcp/manager.ts` and `src/drivers/tool-registry.ts` uses single `_` instead.

Single underscore is ambiguous: for a tool like `mcp_lsp_textDocument_hover`, it's impossible to determine where the server name ("lsp") ends and the tool name begins without external knowledge. With `__`, the boundary is explicit: `mcp__lsp__textDocument_hover`.

## Goals / Non-Goals

**Goals:**
- Use `__` as the separator for MCP tool names and driver names, matching the spec convention
- Update prefix extraction in `tool-registry.ts` to split on `__` for correct server grouping

**Non-Goals:**
- No migration tool for existing persisted permissions (low blast radius at this stage)
- No change to the MCP wire protocol or MCP server configurations
- No change to how tools are discovered or loaded — only the naming changes

## Decisions

### Decision 1: Separator format: `mcp__<server>__<tool>`

Both boundaries use `__`: between `mcp` and `<server>`, and between `<server>` and `<tool>`.

```typescript
// Before (buggy):
const toolName = `mcp_${serverName}_${def.name}`;
// Result: mcp_lsp_textDocument_hover — ambiguous

// After (correct):
const toolName = `mcp__${serverName}__${def.name}`;
// Result: mcp__lsp__textDocument_hover — unambiguous
```

The driver name also uses `__`:
```typescript
// Before:
name: `mcp_${serverName}`  // "mcp_lsp"
// After:
name: `mcp__${serverName}` // "mcp__lsp"
```

### Decision 2: Prefix extraction

The grouping logic in `tool-registry.ts` must split on `__`:

```typescript
// Before:
const prefix = name.startsWith("mcp_")
  ? name.split("_").slice(0, 2).join("_")
  : "other";

// After:
const prefix = name.startsWith("mcp__")
  ? name.split("__").slice(0, 2).join("__")
  : "other";
```

For `mcp__lsp__textDocument_hover`, `split("__")` gives `["mcp", "lsp", "textDocument_hover"]`, and `slice(0,2).join("__")` gives `"mcp__lsp"` — the correct server group.

### Decision 3: No migration tool

Persisted permissions in `.dscode/settings.json` that use the old single-underscore format will silently stop matching because `matchesTool` does exact/glob comparison. Users will need to re-save their MCP tool permissions. Given the early stage of the project, this is acceptable — the alternative (writing a migration) adds complexity with minimal benefit.

## Risks / Trade-offs

- **[Risk]** Users with existing `permissions.allow` entries using `mcp_lsp_*` will have broken rules → **Mitigation**: Document in release notes. This is a developer tool in early development; blast radius is minimal.
- **[Risk]** External code or scripts that depend on the old naming format → **Mitigation**: The naming is internal-only. No external API is affected.
- **[Trade-off]** `__` is visually subtle but unambiguous → Chosen over alternatives like `:` (which could conflict with MCP URI schemes) or `/` (which looks like a path).

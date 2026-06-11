## Notes

No spec changes required. Existing specs (`tool-name-glob`, `permission-persist-ui`, `permission-project-persist`) already use `mcp__<server>__<tool>` naming in their scenarios. This change is purely an implementation fix to align with the already-correct specs.

### Affected specs (no changes needed)

| Spec | Status |
|------|--------|
| `tool-name-glob` | Already uses `mcp__lsp__*`, `mcp__github__*` in scenarios |
| `permission-persist-ui` | Already uses `mcp__lsp__textDocument_definition` in scenarios |
| `permission-project-persist` | Already uses `mcp__lsp__textDocument_definition` in scenarios |

## MODIFIED Requirements

### Requirement: PersistRule writes allow/deny format
When `persistRule()` writes a new permission rule to settings.json, it SHALL use the `allow` or `deny` array format rather than the `rules` object array. The tool name SHALL be written as-is (including any `*` wildcard). If `persistRule()` receives an optional `toolNamePattern` parameter, that pattern SHALL be used as the tool name in the persisted rule instead of the prompted tool name.

#### Scenario: Persist allow rule to settings
- **WHEN** user selects "Always Allow (save)" with exact for `mcp__lsp__textDocument_hover`
- **THEN** settings.json `permissions.allow` SHALL contain `"mcp__lsp__textDocument_hover"` and `permissions.rules` SHALL be unchanged

#### Scenario: Persist allow rule with fuzzy pattern
- **WHEN** `persistRule()` is called with `{tool: "mcp__lsp__textDocument_hover", decision: "allow"}` and `toolNamePattern: "mcp__lsp__*"`
- **THEN** settings.json `permissions.allow` SHALL contain `"mcp__lsp__*"` (NOT the original `mcp__lsp__textDocument_hover`)

#### Scenario: Persist deny rule to settings
- **WHEN** a deny rule with `{tool: "mcp__danger__*", decision: "deny"}` is persisted
- **THEN** settings.json `permissions.deny` SHALL contain `"mcp__danger__*"`

#### Scenario: Existing allow array is appended
- **WHEN** settings.json already has `"allow": ["read_file"]` and a new allow rule for `bash` is persisted
- **THEN** `"allow"` SHALL become `["read_file", "bash"]` (no duplicates)

#### Scenario: Duplicate fuzzy pattern not appended
- **WHEN** settings.json already has `"allow": ["mcp__lsp__*"]` and `persistRule()` is called with `toolNamePattern: "mcp__lsp__*"`
- **THEN** `"allow"` SHALL remain `["mcp__lsp__*"]` (no duplicate entry)

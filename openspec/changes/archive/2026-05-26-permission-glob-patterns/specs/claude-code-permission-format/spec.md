## ADDED Requirements

### Requirement: Allow/deny string array format
The configuration loader SHALL recognize `allow` and `deny` arrays under `permissions` in settings.json. Each element SHALL be a tool name string (optionally containing `*` glob wildcards). The loader SHALL convert `allow` entries to `PermissionRule` with `decision: "allow"`, `priority: 5`, and `deny` entries to `decision: "deny"`, `priority: 5`.

#### Scenario: Allow array parsed to rules
- **WHEN** settings.json contains `{"permissions": {"allow": ["read_file", "mcp__lsp__*"]}}`
- **THEN** the permission manager SHALL have rules `{tool: "read_file", decision: "allow", priority: 5}` and `{tool: "mcp__lsp__*", decision: "allow", priority: 5}`

#### Scenario: Deny array parsed to rules
- **WHEN** settings.json contains `{"permissions": {"deny": ["Bash(rm:*)", "mcp__danger__*"]}}`
- **THEN** the permission manager SHALL have deny rules for both patterns

#### Scenario: Allow and deny coexist
- **WHEN** settings.json contains both `"allow": ["mcp__lsp__*"]` and `"deny": ["mcp__lsp__delete"]`
- **THEN** both rules SHALL be present; the deny rule SHALL take effect because equal priority rules are checked in order and deny for the exact or more specific match is evaluated first

### Requirement: Rules array coexists with allow/deny
When `permissions.rules` exists alongside `permissions.allow`/`permissions.deny`, all entries SHALL be merged into a single rule set. Rules from the `rules` array SHALL retain their explicitly declared `priority`. Allow/deny entries SHALL use default priority 5.

#### Scenario: Mixed format merging
- **WHEN** settings.json contains `{"permissions": {"allow": ["read_file"], "rules": [{"tool": "bash", "decision": "deny", "priority": 100}]}}`
- **THEN** the merged rule set SHALL contain both `{tool: "read_file", decision: "allow", priority: 5}` and `{tool: "bash", decision: "deny", priority: 100}`

#### Scenario: Higher priority in rules overrides allow array
- **WHEN** `rules` has `{tool: "write_file", decision: "deny", priority: 50}` and `allow` has `["write_file"]`
- **THEN** `write_file` SHALL be denied because the higher priority rule from `rules` matches first

### Requirement: PersistRule writes allow/deny format
When `persistRule()` writes a new permission rule to settings.json, it SHALL use the `allow` or `deny` array format rather than the `rules` object array. The tool name SHALL be written as-is (including any `*` wildcard).

#### Scenario: Persist allow rule to settings
- **WHEN** user selects "Always Allow (save)" for `mcp__lsp__textDocument_hover`
- **THEN** settings.json `permissions.allow` SHALL contain `"mcp__lsp__textDocument_hover"` and `permissions.rules` SHALL be unchanged

#### Scenario: Persist deny rule to settings
- **WHEN** a deny rule with `{tool: "mcp__danger__*", decision: "deny"}` is persisted
- **THEN** settings.json `permissions.deny` SHALL contain `"mcp__danger__*"`

#### Scenario: Existing allow array is appended
- **WHEN** settings.json already has `"allow": ["read_file"]` and a new allow rule for `bash` is persisted
- **THEN** `"allow"` SHALL become `["read_file", "bash"]` (no duplicates)

### Requirement: Empty allow/deny arrays handled gracefully
When settings.json has no `permissions` key or `permissions` is empty, the system SHALL treat it as having no allow/deny rules.

#### Scenario: No permissions key
- **WHEN** settings.json has no `permissions` key
- **THEN** no additional rules are loaded from allow/deny

#### Scenario: Empty permissions block
- **WHEN** settings.json has `"permissions": {}`
- **THEN** no additional rules are loaded

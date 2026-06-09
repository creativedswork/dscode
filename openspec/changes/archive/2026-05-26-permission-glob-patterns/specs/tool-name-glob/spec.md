## ADDED Requirements

### Requirement: Glob wildcard in tool name rules
The `PermissionManager.evaluate()` method SHALL support `*` as a glob wildcard in `rule.tool` values. A `*` SHALL match zero or more of any character (including `_`). The system SHALL compile glob patterns to regular expressions internally and cache them.

#### Scenario: Exact match takes precedence over glob
- **WHEN** `rules` contains `{tool: "mcp__github__delete", decision: "deny", priority: 50}` and `{tool: "mcp__github__*", decision: "allow", priority: 5}`
- **THEN** calling `mcp__github__delete` SHALL be denied (exact match with higher priority wins)

#### Scenario: Glob matches all tools from a server
- **WHEN** `rules` contains `{tool: "mcp__lsp__*", decision: "allow", priority: 5}`
- **THEN** calling `mcp__lsp_textDocument_hover`, `mcp__lsp_textDocument_definition`, and any other tool prefixed with `mcp__lsp_` SHALL be allowed

#### Scenario: Glob does not cross server boundaries
- **WHEN** `rules` contains `{tool: "mcp__lsp__*", decision: "allow"}`
- **THEN** calling `mcp__github__search` SHALL not match (falls through to next rule or default)

#### Scenario: Mid-name wildcard
- **WHEN** `rules` contains `{tool: "mcp__*__search", decision: "allow"}`
- **THEN** calling `mcp__github__search` and `mcp__lsp__search` SHALL both be allowed

#### Scenario: Pure exact match still works
- **WHEN** `rules` contains `{tool: "bash", decision: "deny"}` and no wildcard is present
- **THEN** calling `bash` SHALL be denied via exact match

#### Scenario: Global wildcard still works
- **WHEN** `rules` contains `{tool: "*", decision: "deny"}`
- **THEN** all tools SHALL be denied unless overridden by a higher-priority more-specific rule

### Requirement: Glob patterns are compiled once and cached
`PermissionManager` SHALL compile glob patterns to `RegExp` objects once during construction or rule addition, and reuse the compiled regex on each `evaluate()` call.

#### Scenario: Pattern cache avoids recompilation
- **WHEN** `evaluate()` is called 1000 times with `{tool: "mcp__lsp__*"}`
- **THEN** the glob-to-regex compilation SHALL occur once, not 1000 times

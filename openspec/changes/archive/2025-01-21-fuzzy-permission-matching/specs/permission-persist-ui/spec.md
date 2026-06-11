## MODIFIED Requirements

### Requirement: TUI permission dialog includes save option
The TUI permission prompt SHALL present options: "Allow", "Always Allow", "Always Allow (save)", and "Deny". When the user selects "Always Allow (save)" and a fuzzy pattern can be derived from the tool name, the TUI SHALL display a sub-menu with exact and fuzzy options before saving. The "Input Idea" option SHALL be removed. The save option SHALL use key "s" with a distinct color.

#### Scenario: TUI shows save option
- **WHEN** the agent requests permission for tool `mcp__lsp__textDocument_definition`
- **THEN** the TUI SHALL display options: `[Allow] [Always Allow] [Always Allow (save)] [Deny]`

#### Scenario: Save option writes exact name to settings.json
- **WHEN** user selects "Always Allow (save)" for `mcp__lsp__textDocument_definition` and chooses exact
- **THEN** `PermissionPromptResult` SHALL have `decision: "allow"`, `rememberForSession: true`, and `persistRule: {tool: "mcp__lsp__textDocument_definition", decision: "allow"}`

#### Scenario: Save option writes fuzzy pattern to settings.json
- **WHEN** user selects "Always Allow (save)" for `mcp__lsp__textDocument_definition` and chooses fuzzy
- **THEN** `PermissionPromptResult` SHALL have `decision: "allow"`, `rememberForSession: true`, and `persistRule: {tool: "mcp__lsp__*", decision: "allow"}`

#### Scenario: Save option key binding
- **WHEN** user presses "s" during permission prompt
- **THEN** the "Always Allow (save)" SHALL be activated (showing sub-options if fuzzy is derivable)

### Requirement: Web UI permission dialog includes save button
The Web `PermissionDialog` component SHALL present a "Save as Rule" button alongside "Allow", "Always Allow", and "Deny". When clicked and a fuzzy pattern can be derived, the save area SHALL expand to show "Exact" and "Fuzzy" sub-buttons.

#### Scenario: Web UI shows save button
- **WHEN** a permission prompt is active in the Web UI
- **THEN** four buttons SHALL be displayed: `[Allow] [Always Allow] [Save as Rule] [Deny]`

#### Scenario: Web save button sends persist command (exact)
- **WHEN** user clicks "Save as Rule" then "Exact" in Web UI
- **THEN** a `ClientCommand` of type `permission` with `decision: "always_allow_save"` SHALL be sent to the backend

#### Scenario: Web save button sends persist command (fuzzy)
- **WHEN** user clicks "Save as Rule" then "Fuzzy: mcp__playcanvas__*" in Web UI
- **THEN** a `ClientCommand` of type `permission` with `decision: "always_allow_save"` and `toolNamePattern: "mcp__playcanvas__*"` SHALL be sent to the backend

### Requirement: Wire protocol supports always_allow_save
The `ClientCommand.permission.decision` type SHALL include `"always_allow_save"` as a valid value. The `PermOption.value` type in shared types SHALL include `"always_allow_save"`. The `ClientCommand.permission` payload SHALL include an optional `toolNamePattern: string` field.

#### Scenario: Backend receives always_allow_save
- **WHEN** Web UI sends `{type: "permission", decision: "always_allow_save"}`
- **THEN** the web backend SHALL resolve the permission with `decision: "allow"`, `rememberForSession: true`, and `persistRule: {tool: <current tool>, decision: "allow"}`

#### Scenario: Backend receives always_allow_save with toolNamePattern
- **WHEN** Web UI sends `{type: "permission", decision: "always_allow_save", toolNamePattern: "mcp__lsp__*"}`
- **THEN** the web backend SHALL resolve the permission with `decision: "allow"`, `rememberForSession: true`, and `persistRule: {tool: "mcp__lsp__*", decision: "allow"}`

### Requirement: Session grants remain exact match
The "Always Allow" (session-level) option SHALL continue to use `sessionGrants` which stores exact tool names only. Session grants SHALL NOT support glob patterns.

#### Scenario: Session grant is exact
- **WHEN** user selects "Always Allow" for `mcp__lsp__textDocument_hover`
- **THEN** only `mcp__lsp__textDocument_hover` is added to session grants; `mcp__lsp__textDocument_definition` is NOT automatically granted

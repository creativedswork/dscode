## ADDED Requirements

### Requirement: TUI permission dialog includes save option
The TUI permission prompt SHALL present a fourth option "Always Allow (save)" in addition to "Allow", "Always Allow", and "Deny". The "Input Idea" option SHALL be removed. The save option SHALL use key "s" with a distinct color.

#### Scenario: TUI shows save option
- **WHEN** the agent requests permission for tool `mcp__lsp__textDocument_definition`
- **THEN** the TUI SHALL display options: `[Allow] [Always Allow] [Always Allow (save)] [Deny]`

#### Scenario: Save option writes to settings.json
- **WHEN** user selects "Always Allow (save)" for `mcp__lsp__textDocument_definition`
- **THEN** `PermissionPromptResult` SHALL have `decision: "allow"`, `rememberForSession: true`, and `persistRule: {tool: "mcp__lsp__textDocument_definition", decision: "allow"}`

#### Scenario: Save option key binding
- **WHEN** user presses "s" during permission prompt
- **THEN** the "Always Allow (save)" option SHALL be selected

### Requirement: Web UI permission dialog includes save button
The Web `PermissionDialog` component SHALL present a fourth button "Always Allow (save)" alongside "Allow", "Always Allow", and "Deny".

#### Scenario: Web UI shows save button
- **WHEN** a permission prompt is active in the Web UI
- **THEN** four buttons SHALL be displayed: `[Allow] [Always Allow] [Save as Rule] [Deny]`

#### Scenario: Web save button sends persist command
- **WHEN** user clicks "Save as Rule" in Web UI
- **THEN** a `ClientCommand` of type `permission` with `decision: "always_allow_save"` SHALL be sent to the backend

### Requirement: Wire protocol supports always_allow_save
The `ClientCommand.permission.decision` type SHALL include `"always_allow_save"` as a valid value. The `PermOption.value` type in shared types SHALL include `"always_allow_save"`.

#### Scenario: Backend receives always_allow_save
- **WHEN** Web UI sends `{type: "permission", decision: "always_allow_save"}`
- **THEN** the web backend SHALL resolve the permission with `decision: "allow"`, `rememberForSession: true`, and `persistRule: {tool: <current tool>, decision: "allow"}`

### Requirement: Session grants remain exact match
The "Always Allow" (session-level) option SHALL continue to use `sessionGrants` which stores exact tool names only. Session grants SHALL NOT support glob patterns.

#### Scenario: Session grant is exact
- **WHEN** user selects "Always Allow" for `mcp__lsp__textDocument_hover`
- **THEN** only `mcp__lsp__textDocument_hover` is added to session grants; `mcp__lsp__textDocument_definition` is NOT automatically granted

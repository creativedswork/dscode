## ADDED Requirements

### Requirement: persistRule saves to project-level settings.json
The `PermissionManager.persistRule()` method SHALL write permission rules to the project-level `.dscode/settings.json` (via `saveProjectSettings`), not to the user-level `~/.dscode/settings.json`.

#### Scenario: Allow rule saved to project settings
- **WHEN** user selects "Always Allow (save)" for tool `mcp__lsp__textDocument_definition` in project `/home/user/myproject`
- **THEN** `/home/user/myproject/.dscode/settings.json` SHALL contain `permissions.allow` array including `"mcp__lsp__textDocument_definition"`
- **AND** `~/.dscode/settings.json` SHALL NOT be modified

#### Scenario: Deny rule saved to project settings
- **WHEN** user selects "Always Deny (save)" for tool `bash` with pattern `rm -rf`
- **THEN** project `.dscode/settings.json` SHALL contain `permissions.deny` array including `"bash"`

### Requirement: saveProjectSettings merges with existing project settings
The new `saveProjectSettings(projectPath, partial)` function SHALL merge `partial` with existing project settings at `<projectPath>/.dscode/settings.json`. Existing keys not present in `partial` SHALL be preserved. Keys with `null` values in `partial` SHALL be deleted.

#### Scenario: Merge preserves existing keys
- **WHEN** project settings already contains `{"modelId": "deepseek-v4-flash", "skills": ["test-echo"]}`
- **AND** `saveProjectSettings` is called with `{permissions: {allow: ["read_file"]}}`
- **THEN** resulting settings SHALL contain `modelId`, `skills`, AND `permissions`

#### Scenario: Auto-create .dscode directory
- **WHEN** project directory exists but `.dscode/` directory does not
- **AND** `saveProjectSettings` is called
- **THEN** `.dscode/` directory SHALL be created automatically
- **AND** `settings.json` SHALL be written successfully

### Requirement: PermissionManager accepts projectPath
The `PermissionManager` constructor SHALL accept a `projectPath: string` parameter used by `persistRule` to determine the target settings file path.

#### Scenario: Construction with projectPath
- **WHEN** `new PermissionManager(config, promptUser, "/home/user/myproject", onBeforePrompt)` is called
- **THEN** the instance SHALL store `projectPath` and use it in `persistRule` calls

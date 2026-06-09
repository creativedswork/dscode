## MODIFIED Requirements

### Requirement: Canonical PermOption type
The shared module SHALL define a `PermOption` type representing a single permission choice in the UI, with `value`, `label`, and `key` fields.

#### Scenario: Permission options list
- **WHEN** a permission prompt is displayed
- **THEN** the available options are represented as `PermOption[]` with values `"allow" | "always_allow" | "always_allow_save" | "deny"`

### Requirement: Permission types shared between TUI and Web
Both TUI (`conversation.ts`) and Web UI (`App.tsx`) SHALL use the shared `PermissionPrompt`, `PermissionDecision`, and `PermOption` types instead of local definitions.

#### Scenario: TUI uses shared types
- **WHEN** TUI displays a permission prompt
- **THEN** the prompt state uses the shared `PermissionPrompt` type and the options include `"always_allow_save"`

#### Scenario: Web uses shared types
- **WHEN** Web UI displays a permission prompt dialog
- **THEN** the prompt state uses the shared `PermissionPrompt` type and the save button sends `"always_allow_save"` via wire protocol

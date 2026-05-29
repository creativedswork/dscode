## ADDED Requirements

### Requirement: Canonical PermissionPrompt type
The shared module SHALL define a canonical `PermissionPrompt` type representing an active permission request from the server.

#### Scenario: Permission prompt fields
- **WHEN** a permission prompt is active
- **THEN** the `PermissionPrompt` has `toolName: string` and `preview: string`

### Requirement: Canonical PermissionDecision type
The shared module SHALL define a canonical `PermissionDecision` type as the union `"allow" | "deny" | "ask"`.

#### Scenario: Allow decision
- **WHEN** user approves a tool call
- **THEN** the decision is `"allow"`

#### Scenario: Deny decision
- **WHEN** user rejects a tool call
- **THEN** the decision is `"deny"`

### Requirement: Canonical PermOption type
The shared module SHALL define a `PermOption` type representing a single permission choice in the UI, with `value`, `label`, and `key` fields.

#### Scenario: Permission options list
- **WHEN** a permission prompt is displayed
- **THEN** the available options are represented as `PermOption[]` with values `"allow" | "always_allow" | "deny"`

### Requirement: Permission types shared between TUI and Web
Both TUI (`conversation.ts`) and Web UI (`App.tsx`) SHALL use the shared `PermissionPrompt`, `PermissionDecision`, and `PermOption` types instead of local definitions.

#### Scenario: TUI uses shared types
- **WHEN** TUI displays a permission prompt
- **THEN** the prompt state uses the shared `PermissionPrompt` type

#### Scenario: Web uses shared types
- **WHEN** Web UI displays a permission prompt dialog
- **THEN** the prompt state uses the shared `PermissionPrompt` type

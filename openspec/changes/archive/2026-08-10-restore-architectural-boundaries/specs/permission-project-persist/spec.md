## MODIFIED Requirements

### Requirement: persistRule saves to project-level settings.json
Persisted permission decisions SHALL still update project-level
`.dscode/settings.json`, but PermissionManager SHALL request the update through an
injected `PermissionPolicyStore` or SettingsService port. PermissionManager MUST NOT
import Core configuration I/O or write files directly.

#### Scenario: Allow rule is saved
- **WHEN** the user chooses the persistent allow action for a Tool pattern
- **THEN** PermissionManager SHALL send the normalized rule to its persistence port
- **AND** project `permissions.allow` SHALL contain the pattern

#### Scenario: Deny rule is saved
- **WHEN** the user chooses a persistent deny action
- **THEN** the persistence port SHALL update project `permissions.deny`
- **AND** user-level settings and unrelated project fields SHALL remain unchanged

### Requirement: saveProjectSettings merges with existing project settings
SettingsRepository SHALL provide an atomic scoped patch operation that preserves
unrelated project settings, creates the `.dscode` directory when required, validates
the resulting document, and writes through the existing safe file-update mechanism.
Feature modules MUST NOT implement their own read-merge-write sequence.

#### Scenario: Patch preserves existing keys
- **WHEN** a permission patch is applied to settings containing model, Skill, or Integration fields
- **THEN** all unrelated fields SHALL remain structurally unchanged
- **AND** only the targeted permission field SHALL change

#### Scenario: Settings directory is absent
- **WHEN** a valid project patch targets a project without `.dscode/`
- **THEN** SettingsRepository SHALL create the required directory and persist settings

#### Scenario: Concurrent feature updates are serialized
- **WHEN** two settings commands target different fields in the same scope
- **THEN** SettingsRepository SHALL serialize or atomically reconcile the patches
- **AND** neither successful update SHALL be lost

### Requirement: PermissionManager accepts projectPath
PermissionManager SHALL receive an injected permission-policy persistence port already
bound to the active project scope. Project path changes SHALL replace or rebind that port
through Application coordination rather than giving PermissionManager filesystem access.

#### Scenario: PermissionManager is constructed
- **WHEN** the Composition Root or coordinator creates PermissionManager
- **THEN** it SHALL provide policy config, the prompt port, and the persistence port
- **AND** PermissionManager SHALL not require Core config helpers

#### Scenario: Project changes
- **WHEN** project switching commits a new target
- **THEN** subsequent persisted permission rules SHALL target the new project scope
- **AND** no rule SHALL be written to the previous project

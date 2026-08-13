# permission-project-persist Specification

## Purpose

Define project-scoped permission persistence through SettingsService-owned
atomic patches and an injected PermissionManager policy port.

## Requirements

### Requirement: persistRule saves to project-level settings.json

Persisted permission decisions SHALL update project-level
`.dscode/settings.json`, not user-level settings.

#### Scenario: Allow rule is saved

- **WHEN** the user persists an allow rule
- **THEN** PermissionManager SHALL send the normalized rule to its persistence port
- **AND** the project permission policy SHALL contain the rule

#### Scenario: Deny rule is saved

- **WHEN** the user persists a deny rule
- **THEN** the project permission policy SHALL contain the denial
- **AND** user settings SHALL remain unchanged

### Requirement: saveProjectSettings merges with existing project settings

SettingsRepository SHALL provide an atomic scoped patch that preserves unrelated
keys and serializes concurrent successful mutations.

#### Scenario: Patch preserves existing keys

- **WHEN** a permission patch targets settings containing model, Skill, or integration fields
- **THEN** unrelated fields SHALL remain structurally unchanged

#### Scenario: Settings directory is absent

- **WHEN** a valid project patch targets a project without `.dscode/`
- **THEN** SettingsRepository SHALL create the directory and persist the patch

#### Scenario: Concurrent feature updates are serialized

- **WHEN** two settings commands target different fields in one scope
- **THEN** neither successful update SHALL be lost

### Requirement: PermissionManager accepts project policy persistence

PermissionManager SHALL receive policy configuration, the permission prompt
port, and an injected policy persistence port. It MUST NOT depend on project
paths or configuration file I/O.

#### Scenario: PermissionManager is constructed

- **WHEN** Bootstrap or Application constructs PermissionManager
- **THEN** it SHALL receive its persistence behavior through an owner-defined port

#### Scenario: Project changes

- **WHEN** a project switch commits
- **THEN** subsequent persisted rules SHALL target the new project scope
- **AND** no rule SHALL be written to the previous project

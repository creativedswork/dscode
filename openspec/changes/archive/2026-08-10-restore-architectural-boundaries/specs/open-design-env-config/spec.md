## MODIFIED Requirements

### Requirement: Typed Open Design integration settings
OpenDesignIntegration SHALL own `OpenDesignIntegrationConfig`, its scoped merge,
validation, defaults, compatibility fallback, and diagnostics. IntegrationRegistry
SHALL provide raw scoped settings and runtime overrides to the resolver before calling
`prepare()`. `HarnessConfig`, Core types, and generic SettingsRepository MUST NOT
declare an `openDesign` field or import the Open Design config type.

#### Scenario: Valid user configuration is loaded
- **WHEN** user settings contain a valid `integrations.openDesign` object
- **THEN** the Open Design resolver SHALL produce an immutable typed configuration
- **AND** IntegrationRegistry SHALL pass that configuration only to OpenDesignIntegration

#### Scenario: Project fields override user fields
- **WHEN** user and project settings both define Open Design fields
- **THEN** the Open Design resolver SHALL apply the documented field-level project precedence
- **AND** unspecified valid user fields SHALL remain available

#### Scenario: Port is omitted
- **WHEN** Open Design configuration and compatibility inputs omit `port`
- **THEN** the Open Design resolver SHALL use `7456`

#### Scenario: Configuration is invalid
- **WHEN** the path is empty, port is outside `1..65535`, or a field has an invalid type
- **THEN** the Open Design resolver SHALL produce a diagnostic
- **AND** IntegrationRegistry SHALL not start the invalid service configuration

#### Scenario: A different Integration is registered
- **WHEN** another Integration adds its own settings namespace
- **THEN** Core configuration code SHALL require no Open Design-style branch
- **AND** the new Integration SHALL own its own resolver and typed config

## ADDED Requirements

### Requirement: Open Design configuration is absent from HarnessAPI
Open Design configuration SHALL remain internal to the Integration subsystem.
Presentation and general Application consumers MUST NOT receive its typed config through
HarnessAPI or the public runtime configuration snapshot.

#### Scenario: UI reads general configuration
- **WHEN** TUI or Web queries the public configuration snapshot
- **THEN** no mutable OpenDesignIntegrationConfig object SHALL be exposed
- **AND** any future Integration status UI SHALL use a generic Integration status query

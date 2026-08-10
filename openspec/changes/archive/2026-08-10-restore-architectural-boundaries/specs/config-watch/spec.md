## MODIFIED Requirements

### Requirement: ConfigWatch observable config layer
The system SHALL provide an internal runtime configuration snapshot store, retaining
the `ConfigWatch` name only if useful for migration. It SHALL accept complete validated
snapshots from SettingsService and notify subscribers after atomic replacement.
Feature-specific mutation methods and filesystem persistence MUST NOT be implemented by
the snapshot store.

#### Scenario: Validated snapshot is committed
- **WHEN** SettingsService completes a configuration command
- **THEN** the runtime store SHALL atomically replace its current snapshot
- **AND** each subscriber SHALL be notified once with the new snapshot

#### Scenario: Invalid configuration is submitted
- **WHEN** feature validation rejects a settings command
- **THEN** the runtime store SHALL retain its previous snapshot
- **AND** no change notification SHALL be emitted

#### Scenario: Feature setting changes
- **WHEN** model, vision, MCP, Integration, project path, or another feature setting changes
- **THEN** the owning SettingsService command SHALL create the next complete snapshot
- **AND** the runtime store SHALL not expose feature-specific setters

### Requirement: Read-only snapshot via get()
The runtime configuration store SHALL return an immutable snapshot that does not share
mutable objects or arrays with its internal next-state construction. External consumers
MUST NOT receive the mutation-capable store through HarnessAPI.

#### Scenario: Existing snapshot is retained by a consumer
- **WHEN** a later configuration command commits a new snapshot
- **THEN** the previously returned snapshot SHALL remain structurally unchanged
- **AND** the consumer SHALL receive the new value only through query or subscription

#### Scenario: Presentation reads configuration
- **WHEN** TUI or Web requests current settings
- **THEN** HarnessAPI SHALL return a masked public projection
- **AND** Presentation SHALL not call the runtime store's `get()` method directly

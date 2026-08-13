# module-boundary-contracts Specification

## Purpose

Define owner-controlled contracts, allowed dependency directions, and the
machine-enforced composition boundary for production modules.

## Requirements

### Requirement: Contracts are owned by the capability that defines their semantics

Each subsystem SHALL define its public data types, ports, and configuration
under its own source owner. The repository MUST NOT use a cross-domain type
repository.

#### Scenario: Feature type is introduced

- **WHEN** a feature-specific contract is added
- **THEN** it SHALL be declared under the owning feature
- **AND** adding it SHALL not require editing a central type registry

#### Scenario: Cross-feature contract is required

- **WHEN** two modules exchange a value
- **THEN** the semantic owner SHALL export the contract
- **AND** consumers SHALL import that contract instead of duplicating it

### Requirement: Dependency direction follows ports and adapters

Production dependencies SHALL point from Presentation to Application ports,
from Application to owner-defined feature contracts, and from Adapters toward
Kernel or feature ports. Runtime and persistence modules MUST NOT depend on
Presentation.

#### Scenario: UI invokes a use case

- **WHEN** TUI or Web switches a Session, changes settings, toggles a Skill, or submits a prompt
- **THEN** it SHALL invoke a HarnessAPI command or query
- **AND** SHALL not call a concrete Manager

#### Scenario: Runtime emits information for display

- **WHEN** Runtime, MCP, Session, or Eval produces renderable state
- **THEN** it SHALL publish an owner-defined event or snapshot
- **AND** Presentation SHALL project it into a UI model

### Requirement: Composition Root is the only concrete assembly exception

`src/bootstrap/` and explicitly designated composition modules SHALL be the
only locations allowed to instantiate concrete implementations across owner
boundaries. This exception permits wiring, not feature logic.

#### Scenario: Open Design is prepared

- **WHEN** the executable prepares Open Design
- **THEN** Bootstrap MAY call the Open Design-owned preparation API
- **AND** Application and Config contracts SHALL remain unaware of its private configuration shape

#### Scenario: UI backend is selected

- **WHEN** CLI arguments select TUI or Web
- **THEN** Bootstrap SHALL construct the selected adapter
- **AND** Harness SHALL not import that concrete adapter

### Requirement: Removed compatibility paths do not remain

Completed ownership migrations SHALL remove compatibility re-exports, duplicate
modules, and path aliases. New production imports MUST use the active owner.

#### Scenario: Owner type is relocated

- **WHEN** a type moves from a catch-all module to its owner
- **THEN** production imports SHALL use the owner path
- **AND** architecture verification SHALL reject the removed compatibility path

### Requirement: Architecture boundaries are checked automatically

The repository SHALL provide a deterministic TypeScript AST architecture check
covering owner classification, dependency direction, type-only exceptions, and
designated composition roots.

#### Scenario: Forbidden Presentation dependency is added

- **WHEN** a non-Presentation production module imports a UI implementation or DTO
- **THEN** architecture verification SHALL fail with the violated rule

#### Scenario: Composition Root imports concrete implementations

- **WHEN** a designated Bootstrap module imports concrete integrations and UI adapters
- **THEN** architecture verification SHALL accept those wiring imports
- **AND** SHALL not grant the same exception to other modules

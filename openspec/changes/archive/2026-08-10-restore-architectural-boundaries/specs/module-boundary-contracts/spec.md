## ADDED Requirements

### Requirement: Contracts are owned by the capability that defines their semantics
Each domain or subsystem SHALL define its public data types, ports, and configuration
types within its own module. Core MUST NOT act as a catch-all type repository for
Driver, Skill, Command, Memory, Permission, Vision, Session, Integration, or
device-specific contracts.

#### Scenario: Feature type is introduced
- **WHEN** a new Integration, Driver, or feature-specific configuration type is added
- **THEN** the type SHALL be declared under the owning feature module
- **AND** adding the type SHALL NOT require editing a central `core/types.ts` registry

#### Scenario: Cross-feature contract is required
- **WHEN** two modules need to exchange a value
- **THEN** the module that defines the value semantics SHALL export the contract
- **AND** the consumer SHALL import that owner-defined contract instead of duplicating it

### Requirement: Dependency direction follows ports and adapters
Production imports SHALL follow these directions:

- Bootstrap/Composition Root MAY depend on concrete Application, Presentation,
  Integration, Driver, Storage, and Service implementations.
- Presentation MAY depend on Application commands, queries, event sources, and
  Presentation-owned models.
- Application coordination MAY depend on owner-defined feature ports and domain types.
- Adapters MAY depend on the ports and domain types they implement.
- Domain, persistence, runtime, Driver, Integration, Service, and Application modules
  MUST NOT depend on Presentation implementations or Presentation DTOs.

#### Scenario: UI invokes a use case
- **WHEN** TUI or Web needs to switch a Session, update configuration, toggle a Skill,
  inspect a Tool, or submit a prompt
- **THEN** it SHALL invoke an Application command or query port
- **AND** it SHALL NOT import or call the concrete Manager that implements the operation

#### Scenario: Runtime emits information for display
- **WHEN** Agent Runtime, MCP, Session, or Eval produces state that a UI renders
- **THEN** the producer SHALL emit an owner-defined domain or application event
- **AND** a Presentation projector SHALL convert that event into a UI model

### Requirement: Composition Root is the only concrete assembly exception
The process bootstrap entry and explicitly designated composition modules SHALL be the
only modules allowed to import concrete implementations from multiple architectural
layers for construction and wiring. This exception MUST NOT permit business logic,
device-specific parsing, or runtime workflow implementation in the Composition Root.

#### Scenario: Open Design is registered
- **WHEN** the executable assembles available integrations
- **THEN** the Composition Root MAY instantiate `OpenDesignIntegration`
- **AND** Core configuration types and Application ports SHALL remain unaware of the
  Open Design configuration shape

#### Scenario: UI backend is selected
- **WHEN** CLI arguments select TUI or Web mode
- **THEN** the Composition Root SHALL construct the selected Presentation adapter
- **AND** the Application Harness SHALL NOT import or instantiate that concrete adapter

### Requirement: Compatibility re-exports are transitional and one-way
Compatibility re-exports SHALL remain transitional and one-way. Existing import paths
MAY temporarily re-export owner-defined types during migration.
Compatibility modules MUST NOT define new domain types, and new or modified production
code MUST import from the owning module.

#### Scenario: Core type is relocated
- **WHEN** a type moves from `core/types.ts` to its owner
- **THEN** `core/types.ts` MAY re-export it for a bounded migration period
- **AND** the architecture checker SHALL reject new imports of that compatibility path

### Requirement: Architecture boundaries are checked automatically
The repository SHALL provide a deterministic static architecture check based on parsed
TypeScript import/export declarations. The check SHALL run in the standard verification
workflow and fail with the importing file, imported file, and violated rule.

#### Scenario: Forbidden Presentation dependency is added
- **WHEN** a non-Presentation production module imports `src/ui/` or a UI DTO
- **THEN** the architecture check SHALL fail
- **AND** its diagnostic SHALL identify the violated runtime-presentation rule

#### Scenario: Composition Root imports concrete implementations
- **WHEN** the designated Composition Root imports a concrete Integration and UI adapter
- **THEN** the architecture check SHALL accept those imports
- **AND** it SHALL not grant the same exception to other Core files

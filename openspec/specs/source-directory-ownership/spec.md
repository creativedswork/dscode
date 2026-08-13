# source-directory-ownership Specification

## Purpose

Define one explicit owner for every production source root and prevent
catch-all directories, ambiguous Agent/Application naming, and value-import
exceptions from eroding architecture boundaries.

## Requirements

### Requirement: Source roots have one architectural meaning

The system SHALL classify every top-level source root as Bootstrap, Kernel,
Application, Feature, Adapter, Persistence, or Presentation. `src/core/` and
`src/utils/` MUST NOT exist as catch-all source roots.

#### Scenario: Architecture checker scans all source files

- **WHEN** architecture verification classifies the repository
- **THEN** every `src/**` TypeScript file SHALL match an explicit owner
- **AND** unknown roots, `src/core/`, and `src/utils/` SHALL fail

### Requirement: Application coordination and Agent definitions remain distinct

Application use-case coordination SHALL live in `src/application/`. Agent
authoring, compilation, schema, package resources, and registry snapshots SHALL
live in `src/agents/definitions/`.

#### Scenario: Developer locates an AgentApplication

- **WHEN** a developer follows an Agent definition or compiler
- **THEN** it SHALL resolve under `src/agents/definitions/`
- **AND** running processes SHALL remain under `src/agents/process/`

### Requirement: Agent source rename preserves domain and runtime behavior

The source move to `src/agents/definitions/` SHALL NOT rename Agent domain
types or change Agent.md discovery, precedence, compilation, digest, generation,
snapshot, or launch behavior.

#### Scenario: Existing Agent.md is loaded after migration

- **WHEN** the same bundled, user, compatibility, or project files are loaded
- **THEN** catalog and snapshot behavior SHALL remain unchanged

### Requirement: Skill and MCP remain independent owners

Skill and MCP SHALL remain sibling owners at `src/skills/` and `src/mcp/`.
They MUST NOT share an invented lifecycle, base class, or Registry.

#### Scenario: Skill exposes an MCP-backed Tool

- **WHEN** an active Skill allows an MCP-contributed Tool
- **THEN** Skill SHALL own instructions and the allowlist
- **AND** MCP SHALL own protocol, connection, state, and Driver contribution

### Requirement: Slash Command has one feature owner

Built-in commands, custom manifests, loading, execution context, and Presenter ports SHALL live under `src/slash-commands/`.

#### Scenario: TUI and Web execute the same command

- **WHEN** both adapters invoke a Slash Command
- **THEN** they SHALL use the same implementation and HarnessAPI contract
- **AND** provide structurally compatible Presenter ports

### Requirement: Project File owns file reference and attachment behavior

`src/project-files/` SHALL own `@file` resolution, file recognition, limits,
attachment staging, and project-path handling.

#### Scenario: Explicit file attachment is submitted

- **WHEN** TUI or Web submits an external file
- **THEN** the shared Project File feature SHALL stage and validate it
- **AND** preserve containment, symlink, size, directory, and missing-file behavior

### Requirement: Kernel owns cross-cutting path safety and logging

Canonical path containment and execution-context-aware logging SHALL live under
`src/kernel/` and MUST NOT depend on outer implementations.

#### Scenario: Multiple owners perform containment checks

- **WHEN** features or adapters validate a candidate path
- **THEN** they SHALL use the Kernel-owned path safety API

### Requirement: Presentation adapters have explicit physical owners

TUI-only implementation SHALL live under `src/ui/tui/`, Web-only implementation
under `src/ui/web/`, and shared projectors, reducers, models, and formatters
under `src/ui/shared/`.

#### Scenario: Shared projector is consumed by both adapters

- **WHEN** a projector is imported by TUI and Web
- **THEN** it SHALL remain under `src/ui/shared/`

### Requirement: Single Integration does not create a generic SPI

Open Design-specific configuration and runtime override contracts SHALL remain
under `src/integrations/open-design/`. A generic Integration SPI MUST NOT be
introduced without a second production integration requiring it.

#### Scenario: Open Design runtime is prepared

- **WHEN** Bootstrap prepares Open Design
- **THEN** it SHALL consume Open Design-owned settings and overrides
- **AND** ServiceSupervisor SHALL retain managed-service lifecycle ownership

### Requirement: Owner-contract exceptions are type-only

Architecture verification SHALL allow a cross-owner contract exception only
for type-only imports when the ownership matrix permits it. Runtime value
imports SHALL follow normal dependency rules.

#### Scenario: Presentation imports a feature contract

- **WHEN** Presentation uses `import type` for an immutable owner snapshot
- **THEN** the type-only exception MAY apply
- **BUT WHEN** it imports a runtime value from the same file
- **THEN** normal dependency rules SHALL apply

### Requirement: Directory migration leaves no compatibility paths

Production, test, script, and documentation references SHALL use active owner
paths. Removed paths MUST NOT remain as shims, duplicate modules, aliases, or
architecture exceptions.

#### Scenario: Migration is complete

- **WHEN** ownership verification runs
- **THEN** no reference SHALL resolve through removed Core, Utils, Agent application, Command, or UI command paths
- **AND** the architecture violation baseline SHALL remain zero

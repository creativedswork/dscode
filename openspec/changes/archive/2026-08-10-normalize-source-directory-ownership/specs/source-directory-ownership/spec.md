## ADDED Requirements

### Requirement: Source roots have one architectural meaning

The system SHALL classify every top-level source root as Bootstrap, Kernel,
Application, Feature, Adapter, Persistence, or Presentation. A source root MUST
have one classification and one documented owner. `src/core/` and `src/utils/`
MUST NOT exist as catch-all source roots.

#### Scenario: Architecture checker scans all source files

- **WHEN** the architecture checker classifies the repository
- **THEN** every `src/**` TypeScript file SHALL match an explicit owner rule
- **AND** an unknown top-level source root SHALL fail the check
- **AND** a file under `src/core/` or `src/utils/` SHALL fail the check

### Requirement: Application coordination and Agent definitions remain distinct

The Clean Architecture Application layer SHALL live in `src/application/` and
own HarnessAPI ports, Application events, AgentHost contracts, lifecycle
coordination, and use-case coordinators. Agent authoring data, compilation,
schemas, package resources, and registry snapshots SHALL live in
`src/agents/definitions/`.

#### Scenario: Developer locates an AgentApplication

- **WHEN** a developer follows an `AgentApplication` definition or compiler
- **THEN** the implementation SHALL resolve under `src/agents/definitions/`
- **AND** a running Agent Process SHALL remain under `src/agents/process/`
- **AND** Application-layer use-case coordination SHALL remain under `src/application/`

### Requirement: Agent source rename preserves domain and runtime behavior

Renaming `src/agents/application/` to `src/agents/definitions/` SHALL NOT rename
the `AgentApplication`, `AgentDefinition`, or `AgentApplicationRegistry`
domain types and SHALL NOT change Agent.md discovery, compilation, precedence,
digest, generation, snapshot, or launch behavior.

#### Scenario: Existing Agent.md is loaded after migration

- **WHEN** the same bundled, user, compatibility, or project Agent.md files are loaded
- **THEN** the resulting catalog, diagnostics, digest, generation, and immutable snapshots SHALL be unchanged
- **AND** launching a catalog entry SHALL create the same Agent Process configuration

### Requirement: Skill and MCP remain independent owners

Skill and MCP SHALL remain sibling source owners at `src/skills/` and
`src/mcp/`. They MUST NOT be merged behind a shared `capabilities/`,
`plugins/`, or `extensions/` lifecycle, base class, or Registry.

#### Scenario: Skill exposes MCP-backed tools

- **WHEN** an active Skill allows a Tool contributed by an MCP Server
- **THEN** SkillManager SHALL continue to own instruction activation and the Tool allowlist
- **AND** MCP SHALL continue to own protocol, connection, reconnect, Server state, and Driver contribution
- **AND** their interaction SHALL occur through existing Tool or Driver contracts

### Requirement: Slash Command has one feature owner

Custom Slash Command manifests and built-in command definitions SHALL share
the `src/slash-commands/` owner. Loading,
management, execution context, and Presenter port SHALL live under
`src/slash-commands/`. Slash Command implementations SHALL depend on HarnessAPI
and their owner-defined Presenter port, not on concrete TUI or Web backends.

#### Scenario: TUI and Web execute the same command

- **WHEN** TUI and Web invoke the same built-in or custom Slash Command
- **THEN** both adapters SHALL call the command implementation owned by `src/slash-commands/`
- **AND** both SHALL provide a structurally compatible SlashCommandPresenter
- **AND** command behavior and user-visible output SHALL remain equivalent

### Requirement: Project File owns file reference and attachment behavior

`src/project-files/` SHALL own `@file` resolution, file-type recognition,
configured size limits, explicit attachment staging, and associated
project-path handling. Presentation and Agent Tool code SHALL consume this
feature instead of owning filesystem behavior.

#### Scenario: Explicit file attachment is submitted

- **WHEN** TUI or Web submits an explicit file outside the project sandbox
- **THEN** the same Project File attachment implementation SHALL stage it under the project upload directory
- **AND** canonical containment, symlink, file-size, directory, and missing-file behavior SHALL remain unchanged

### Requirement: Kernel owns cross-cutting path safety and logging

Canonical path containment and execution-context-aware logging SHALL live under
`src/kernel/`. These facilities MUST NOT depend on Application, Feature,
Adapter, Persistence, or Presentation implementations.

#### Scenario: Multiple owners perform containment checks

- **WHEN** Agent capability, Project File, or Web static-file code checks a candidate path
- **THEN** each consumer SHALL use the Kernel-owned canonical path safety API
- **AND** symlink and nearest-existing-parent containment semantics SHALL remain unchanged

### Requirement: Presentation adapters have explicit physical owners

TUI-only implementation SHALL live under `src/ui/tui/`, Web-only
implementation SHALL live under `src/ui/web/`, and their canonical shared
Presentation model, reducer, projector, and pure formatting helpers SHALL live
under `src/ui/shared/`.

#### Scenario: Shared projector is consumed by both adapters

- **WHEN** a Presentation projector is imported by both TUI and Web
- **THEN** it SHALL remain under `src/ui/shared/`
- **AND** TUI-only input, rendering, theme, image, and browser components SHALL live under `src/ui/tui/`
- **AND** no visible UI or wire-protocol behavior SHALL change because of the move

### Requirement: Single Integration does not create a generic SPI

Configuration source and runtime override contracts used only by Open Design SHALL
be owned by `src/integrations/open-design/`. A generic Integration SPI
MUST NOT be introduced until at least two production integrations require the
same contract.

#### Scenario: Open Design runtime is prepared

- **WHEN** Bootstrap prepares the enabled Open Design integration
- **THEN** it SHALL consume Open Design-owned typed settings and overrides
- **AND** ServiceSupervisor SHALL retain managed-service lifecycle ownership
- **AND** no IntegrationRegistry SHALL be required

### Requirement: Owner-contract exceptions are type-only

The architecture checker MUST restrict cross-layer owner-contract exceptions to
type-only import declarations. A
runtime value import MUST be evaluated using normal dependency-direction rules
even when its target file is named `types.ts`.

#### Scenario: Presentation imports a feature contract

- **WHEN** Presentation uses `import type` for an immutable owner snapshot
- **THEN** the architecture checker MAY allow the dependency
- **BUT WHEN** Presentation imports a runtime value from the same file
- **THEN** the architecture checker SHALL evaluate and reject any forbidden dependency direction

### Requirement: Directory migration leaves no compatibility paths

All production, test, script, and documentation imports SHALL use the target
owner paths. Removed internal paths MUST NOT remain as re-export shims,
duplicate modules, path aliases, or architecture exceptions.

#### Scenario: Migration is complete

- **WHEN** source-directory ownership verification runs
- **THEN** no reference SHALL resolve through `src/core/`, `src/utils/`, `src/agents/application/`, `src/commands/`, or `src/ui/commands.ts`
- **AND** architecture violation baseline SHALL remain zero

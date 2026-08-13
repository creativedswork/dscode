# harness-api Specification

## Purpose

Define the stable Application facade consumed by Presentation and trusted
adapters without exposing mutable runtime implementation details.

## Requirements

### Requirement: HarnessAPI Interface Definition

The system SHALL define `HarnessAPI` as typed Command, Query, and Event ports
for conversation, Session, settings, project, memory, Skill, Driver, command,
permission, MCP, Agent Process, Eval, Tool, and image behavior.

#### Scenario: Presentation submits a command

- **WHEN** a UI prompts, aborts, switches Session or project, changes settings, or toggles a Skill
- **THEN** it SHALL call the corresponding typed HarnessAPI command
- **AND** the Application workflow SHALL preserve its invariants

#### Scenario: Presentation reads state

- **WHEN** a UI needs configuration, Sessions, capabilities, Agent activity, usage, or Tool details
- **THEN** it SHALL call a query returning an immutable snapshot
- **AND** SHALL not receive the underlying Manager or Runtime object

### Requirement: Harness implements HarnessAPI

The Application facade supplied by the standard Agent Host SHALL satisfy
`HarnessAPI`. Concrete `Harness` internals MAY implement the ports but SHALL
remain inaccessible through the facade.

#### Scenario: Harness satisfies the public port

- **WHEN** Bootstrap constructs the standard Agent Host
- **THEN** `host.api` SHALL be assignable to `HarnessAPI`
- **AND** TypeScript SHALL reject internal Manager access through that value

#### Scenario: UI backend receives the API

- **WHEN** TUI or Web is constructed
- **THEN** its Application dependency SHALL be typed as `HarnessAPI`
- **AND** SHALL not require the concrete Harness class

### Requirement: HarnessAPI replaces TuiDeps

TUI and Web SHALL receive one `HarnessAPI` value rather than manually assembled
Manager, Registry, Agent, configuration, and callback dependencies.

#### Scenario: TUI is assembled

- **WHEN** Bootstrap selects TUI mode
- **THEN** it SHALL pass HarnessAPI and UserInteraction wiring
- **AND** TUI SHALL not receive internal stores or registries

#### Scenario: Web is assembled

- **WHEN** Bootstrap selects Web mode
- **THEN** it SHALL pass the same HarnessAPI contract
- **AND** HTTP and WebSocket dependencies SHALL remain Web adapter concerns

### Requirement: Zero `as any` casts for harness access

Presentation and Slash Command code SHALL use declared Application ports.
Missing operations SHALL be added as narrow commands or queries rather than by
exposing a Manager or casting the facade.

#### Scenario: Required operation is missing

- **WHEN** Presentation needs behavior absent from HarnessAPI
- **THEN** the owner SHALL add a narrow use-case operation
- **AND** SHALL not expose a concrete subsystem

#### Scenario: TypeScript compilation succeeds

- **WHEN** TUI, Web, Eval commands, and Slash Commands compile
- **THEN** they SHALL require no harness-access type assertions

### Requirement: HarnessAPI exposes event bus

HarnessAPI SHALL expose a subscribe-only typed Application event source.
Consumers MAY subscribe and unsubscribe but MUST NOT publish or clear events.

#### Scenario: UI subscribes to events

- **WHEN** TUI or Web is constructed
- **THEN** it SHALL subscribe through `HarnessAPI.events.on(...)`
- **AND** payloads SHALL use owner-defined contracts

#### Scenario: Consumer attempts to emit

- **WHEN** code holds only a HarnessAPI reference
- **THEN** TypeScript SHALL not expose `emit()` or `clear()`

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

### Requirement: HarnessAPI exposes a typed Plan port
HarnessAPI SHALL expose typed operations to read the active Plan, submit
user-value constraints, perform internal authorization, reconcile structured
Plan verification, request replanning, and cancel. Every mutation SHALL return
a `PlanMutationResult` union with explicit success, conflict,
invalid-transition, and invalid-command variants. Presentation adapters MUST
NOT mutate PlanStore directly.

#### Scenario: Runtime reads an active Plan
- **WHEN** an internal runtime adapter requests the active Plan for a Session
- **THEN** HarnessAPI returns the current immutable Plan snapshot or `undefined` without requiring presentation adapters to display it

#### Scenario: Chat submits an alignment response
- **WHEN** an adapter submits `planId`, `expectedVersion`, `commandId`, `interactionId`, and a selected or custom user-value constraint
- **THEN** HarnessAPI delegates the command to PlanService and returns the committed snapshot

#### Scenario: UI submits stale input
- **WHEN** PlanService rejects a command because its expected version is stale
- **THEN** HarnessAPI returns a typed conflict containing the current version and snapshot without casting through `any`

#### Scenario: UI submits an invalid transition
- **WHEN** a typed command is structurally valid but illegal for the current Plan status
- **THEN** HarnessAPI returns the `invalid_transition` result variant without throwing an untyped error

#### Scenario: Tool evidence satisfies a Plan execution step
- **WHEN** the Host persists Main Tool evidence that satisfies every required verification for the bound PlanExecutionStep
- **THEN** PlanService advances PlanExecutionState atomically without creating or transitioning a TodoItem

#### Scenario: Legacy verifier invokes the compatibility operation
- **WHEN** an internal compatibility caller invokes `verifyItem`
- **THEN** HarnessAPI validates the legacy schema v1 PlanItem, but the operation is not exposed as a Main Agent tool or used by schema v2 Plans

### Requirement: HarnessAPI exposes a typed TaskState port
HarnessAPI SHALL expose read and version-checked mutation operations for the
current Main Agent TaskState. TaskState mutations SHALL be serialized through
the owning Agent context, SHALL return a `TaskStateMutationResult` union, and
MUST NOT mutate PlanRecord, PlanExecutionState, Session transcript, or UI state
as a side effect.

#### Scenario: Adapter reads current task state
- **WHEN** an adapter requests TaskState for the selected Session
- **THEN** HarnessAPI returns the immutable TaskState snapshot owned by that Session's Main Agent or `undefined`

#### Scenario: Main initializes outcome tracking
- **WHEN** Main submits a typed initialize command with request identity, expected context version, and outcome-oriented TodoItems
- **THEN** HarnessAPI commits TaskState to Main AgentContext and returns the new immutable snapshot

#### Scenario: Main advances an outcome
- **WHEN** Main submits a valid transition for a stable todoId and expected TaskState version
- **THEN** HarnessAPI commits the transition once and does not infer the change from Tool, PlanExecutionStep, or continuation state

#### Scenario: TaskState version is stale
- **WHEN** a mutation supplies an older TaskState version
- **THEN** HarnessAPI returns a typed conflict with the current TaskState snapshot and leaves Main AgentContext unchanged

#### Scenario: Presentation attempts to mutate TODO
- **WHEN** a Web or TUI adapter attempts to submit a TaskState mutation
- **THEN** HarnessAPI rejects the command because only the owning Main Agent and recovery coordinator may update current task state

### Requirement: UserInteractionPort supports durable intent alignment
UserInteractionPort SHALL support Chat-native user-value alignment in addition
to tool permission requests. PlanService MUST persist the pending interaction
before invoking the port. Technical decisions and internal Plan authorization
MUST NOT be delegated to presentation adapters.

#### Scenario: Planner requests user-value alignment
- **WHEN** a decision node requires a visual, scope, compatibility, cost, or reversibility preference that cannot be inferred
- **THEN** `requestIntentAlignment` receives the persisted interaction identity, one concise question, an optional recommendation, at most three user-understandable options, and a custom-input path

#### Scenario: Planner resolves a technical decision
- **WHEN** candidate differences do not change a user-visible outcome or explicit product constraint
- **THEN** the Planner resolves the decision without invoking UserInteractionPort

#### Scenario: Adapter reconnects
- **WHEN** an in-memory interaction resolver was lost but the pending interaction remains persisted
- **THEN** Harness reissues the request through the newly attached UserInteractionPort

### Requirement: HarnessAPI preserves domain ownership of Plan state
HarnessAPI SHALL return read-only Plan snapshots and SHALL route every mutation through PlanService validation, CAS, and event emission.

#### Scenario: Presentation attempts an invalid transition
- **WHEN** a client answers an interaction that is no longer pending
- **THEN** PlanService rejects the operation and no Plan file is modified

#### Scenario: Plan mutation succeeds
- **WHEN** a command passes lifecycle, revision, and digest validation
- **THEN** PlanService commits once and HarnessAPI exposes the resulting snapshot

### Requirement: HarnessAPI exposes execution episode snapshots
HarnessAPI SHALL expose a read-only current execution episode snapshot for a Plan or
Session. The snapshot SHALL include identity, phase, policy limits, counters, accepted
progress, reflection use, and any bounded incident summary.

#### Scenario: Consumer reads a running episode
- **WHEN** an adapter requests the current snapshot during approved Plan execution
- **THEN** HarnessAPI returns the authoritative running episode without exposing mutable monitor internals

#### Scenario: No episode exists
- **WHEN** an adapter requests a snapshot for a direct, planning-only, or legacy Session with no episode
- **THEN** HarnessAPI returns no episode without synthesizing a running state

#### Scenario: Consumer reads a paused episode
- **WHEN** an adapter requests a snapshot after an inconclusive pause
- **THEN** HarnessAPI returns the persisted pause reason, accepted progress, and available recovery actions

### Requirement: HarnessAPI exposes narrow episode recovery commands
HarnessAPI SHALL expose typed `adjustPlan` and `continueExecution` commands for a
paused episode. Each command MUST include a command ID, owning Plan identity,
expected version, revision, and digest, and MUST return either an idempotent receipt
or a typed conflict.

#### Scenario: Continue command is current
- **WHEN** a caller submits a valid continue command for the current paused snapshot
- **THEN** HarnessAPI returns the new episode snapshot and a durable command receipt

#### Scenario: Recovery command conflicts
- **WHEN** expected version, revision, digest, ownership, or phase does not match
- **THEN** HarnessAPI rejects the mutation and returns the current authoritative snapshot

#### Scenario: Adapter attempts a general episode mutation
- **WHEN** a caller tries to set counters, progress, phase, or completion directly
- **THEN** HarnessAPI exposes no operation that permits that mutation

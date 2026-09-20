## Purpose

Typed event bus for decoupling Harness core from UI backends — all internal state changes flow through events.
## Requirements
### Requirement: HarnessEventBus typed event emitter

The system SHALL provide a `HarnessEventBus` class with a discriminated union event type `HarnessEvent`. The `type` field SHALL serve as both the event discriminator and the subscription key. The class SHALL support `on(eventType, handler)` for subscription (returning an unsubscribe function) and `emit(event)` for synchronous dispatch.

#### Scenario: Subscribe and receive event

- **WHEN** a handler is registered via `bus.on("llm:text:delta", handler)`
- **AND** `bus.emit({ type: "llm:text:delta", delta: "Hello" })` is called
- **THEN** the handler SHALL be invoked with `{ type: "llm:text:delta", delta: "Hello" }`

#### Scenario: Unsubscribe stops delivery

- **WHEN** `const off = bus.on("llm:text:delta", handler)` is called
- **AND** `off()` is called to unsubscribe
- **AND** `bus.emit({ type: "llm:text:delta", delta: "Hello" })` is subsequently called
- **THEN** the handler SHALL NOT be invoked

#### Scenario: Multiple handlers receive same event

- **WHEN** two handlers A and B are registered for `"tool:start"`
- **AND** `bus.emit({ type: "tool:start", name: "bash", args: {} })` is called
- **THEN** both handler A and handler B SHALL be invoked in registration order

#### Scenario: Handler throws does not break other handlers

- **WHEN** handler A throws an error during event dispatch
- **THEN** handler B (registered after A) SHALL still be invoked
- **AND** the error SHALL be caught and logged

#### Scenario: Emit with no subscribers does not throw

- **WHEN** `bus.emit({ type: "mcp:browser:open" })` is called and no handlers are registered
- **THEN** the call SHALL complete without throwing

### Requirement: HarnessEvent complete event catalog

The Application event catalog SHALL compose owner-defined payload contracts for
LLM, Tool, Turn, Processing, Session, UI notification, Config, MCP, Agent
Process, and Eval events. Presentation SHALL project these payloads rather than
features importing UI models.

#### Scenario: Discriminated union type-checking

- **WHEN** a handler is registered for `"tool:start"`
- **THEN** TypeScript SHALL infer the handler parameter type as `{ type: "tool:start"; name: string; args: unknown }`
- **AND** SHALL reject access to properties from other event types (e.g., `delta`)

#### Scenario: Every event has a unique type string

- **WHEN** the `HarnessEvent` type is inspected
- **THEN** no two union members SHALL have the same `type` literal value

#### Scenario: turn:end usage carries full token and cost data

- **WHEN** the `turn:end` event is emitted
- **THEN** its `usage` field SHALL be of type `{ input: number; output: number; cacheRead: number; cacheWrite: number; total: number; cost: { total: number } } | undefined`
- **AND** the `usage.input` field SHALL contain input token count
- **AND** the `usage.output` field SHALL contain output token count
- **AND** the `usage.cacheRead` field SHALL contain cache read token count
- **AND** the `usage.cacheWrite` field SHALL contain cache write token count
- **AND** the `usage.total` field SHALL contain total token count
- **AND** the `usage.cost.total` field SHALL contain the API cost in USD

### Requirement: turn:abort carries reason field

The `turn:abort` event SHALL include a `reason` field with value `"user"` or `"system"`. `"user"` indicates the user explicitly triggered abort (e.g., Esc key, abort button). `"system"` indicates a system-initiated abort (e.g., shutdown, timeout, session switch).

#### Scenario: User abort has reason "user"

- **WHEN** the user clicks abort or presses Esc
- **THEN** `this.events.emit({ type: "turn:abort", reason: "user" })` SHALL be called

#### Scenario: System abort has reason "system"

- **WHEN** the system aborts due to shutdown or session switch
- **THEN** `this.events.emit({ type: "turn:abort", reason: "system" })` SHALL be called

#### Scenario: Frontend differentiates abort reason

- **WHEN** the frontend receives a `turn:abort` message
- **THEN** it SHALL use the `reason` field to display appropriate messaging
- **AND** `"user"` may show "Cancelled" while `"system"` may show "Session interrupted"

### Requirement: HarnessEventBus ownership and lifecycle

The concrete `HarnessEventBus` SHALL be created by Bootstrap and injected into
Harness for the lifetime of one Agent Host. Internal coordinators SHALL publish
through the event bus; HarnessAPI consumers SHALL receive only its subscribe-only
event-source port.

#### Scenario: Composition Root creates event bus

- **WHEN** Bootstrap assembles an Agent Host
- **THEN** it SHALL create the concrete event bus before Harness and UI adapters

#### Scenario: Event bus accessible via HarnessAPI

- **WHEN** a consumer accesses `harness.events`
- **THEN** it SHALL receive the subscribe-only event source
- **AND** SHALL not be able to emit or clear events

### Requirement: Event payloads are presentation-neutral

Application and feature event modules MUST NOT import `src/ui/`, Web protocol
types, or TUI models.

#### Scenario: MCP connection state is emitted

- **WHEN** MCP publishes connection state
- **THEN** the event SHALL carry an MCP-owned snapshot
- **AND** Presentation SHALL derive Web and TUI models

#### Scenario: Architecture check scans event modules

- **WHEN** an event contract imports a Presentation type
- **THEN** architecture verification SHALL fail

### Requirement: HarnessEvent includes presentation-neutral Plan events
The HarnessEvent discriminated union SHALL include typed events for route decisions, Plan snapshots, pending user-value interactions, internal authorization changes, execution changes, and revision conflicts.

#### Scenario: Auto routing completes
- **WHEN** the Host computes a Direct or Plan route
- **THEN** it emits `plan:route` with request identity, dimension scores, decision, and public evidence summary

#### Scenario: Plan snapshot is committed
- **WHEN** PlanStore commits any new store version, including approval, status, evidence, interaction, or receipt-only updates
- **THEN** PlanService emits `plan:updated` with the immutable committed snapshot

#### Scenario: Human input is required
- **WHEN** a persisted intent-alignment interaction becomes pending
- **THEN** PlanService emits `plan:interaction` with interactionId, planId, revision, one concise question, an optional recommendation, and public user-value options

#### Scenario: Revision conflict occurs
- **WHEN** a Plan command fails compare-and-swap validation
- **THEN** PlanService emits `plan:conflict` with the expected version, current version, semantic revision, and current snapshot

### Requirement: Plan events exclude presentation and private reasoning
Plan events MUST NOT contain JSX, terminal formatting, localized button labels, hidden prompts, or model Chain-of-Thought.

#### Scenario: Web and TUI receive the same alignment
- **WHEN** an intent-alignment event is emitted
- **THEN** both adapters receive the same domain payload and independently choose their presentation

#### Scenario: Planner produces private reasoning
- **WHEN** the Planner evaluates candidates internally
- **THEN** no technical candidate tree or private reasoning is emitted to presentation adapters

### Requirement: Plan events follow commit ordering
Events representing persisted Plan state SHALL be emitted only after a successful atomic commit and SHALL identify the committed store version and semantic revision.

#### Scenario: Commit succeeds
- **WHEN** PlanStore atomically commits store version `N`
- **THEN** the corresponding Plan event carries version `N`, the current semantic revision, and a snapshot observers can immediately read

#### Scenario: Commit fails
- **WHEN** serialization, CAS, or atomic rename fails
- **THEN** no event claims that the uncommitted revision became authoritative

### Requirement: HarnessEvent includes presentation-neutral TaskState events
The HarnessEvent discriminated union SHALL include `task:updated` with the
owning Session identity and immutable TaskState snapshot. TaskState events SHALL
be emitted only after the owning Main AgentContext is committed and SHALL remain
independent from Plan events and runtime progress events.

#### Scenario: Main commits a TaskState mutation
- **WHEN** initialization, refinement, reordering, or a TodoItem transition commits
- **THEN** the Host emits one `task:updated` event carrying the committed TaskState version

#### Scenario: Task mutation fails
- **WHEN** context persistence or TaskState version validation fails
- **THEN** no `task:updated` event claims that the attempted mutation committed

#### Scenario: Tool or Plan progress changes alone
- **WHEN** only Tool evidence, PlanExecutionState, Agent progress, or continuation counters change
- **THEN** the Host does not emit `task:updated` or synthesize a TodoItem transition

#### Scenario: TaskState event reaches presentation adapters
- **WHEN** Web and TUI consume `task:updated`
- **THEN** both receive the same outcome titles, statuses, results, and public blocker summaries without Plan verification, Tool evidence, hidden prompts, or private reasoning

### Requirement: HarnessEventBus publishes presentation-neutral episode state
HarnessEventBus SHALL publish typed episode lifecycle events containing domain state
and stable identifiers without UI labels, component names, rendered markup, or
terminal formatting.

#### Scenario: Episode state changes
- **WHEN** an episode starts, enters reflection, pauses inconclusively, resumes, or completes
- **THEN** the event bus emits a `plan:episode` event with the authoritative snapshot

#### Scenario: Counters change without a lifecycle transition
- **WHEN** accepted progress or bounded monitor counters change
- **THEN** the event bus may emit an updated `plan:episode` snapshot without requiring clients to infer the delta

### Requirement: HarnessEventBus publishes bounded impasse facts
HarnessEventBus SHALL publish a `plan:impasse` event when the Executive Monitor
reaches an impasse threshold. The payload SHALL identify the triggering rule,
reflection availability, unchanged progress summary, and bounded fingerprint or error
facts, and MUST NOT include private model reasoning or unrestricted Tool output.

#### Scenario: First impasse allows reflection
- **WHEN** an initial execution episode reaches an impasse
- **THEN** the emitted event states that reflection is available and identifies the threshold reached

#### Scenario: Later impasse causes pause
- **WHEN** execution reaches an impasse after reflection has been used
- **THEN** the emitted event states that automatic execution will pause inconclusively

#### Scenario: UI adapter consumes an impasse
- **WHEN** Web or TUI receives a `plan:impasse` event
- **THEN** it can render the reason without parsing model text, Tool logs, or warning strings

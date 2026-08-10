## MODIFIED Requirements

### Requirement: HarnessAPI Interface Definition
The system SHALL define `HarnessAPI` as the public Application boundary consumed by
Presentation and Slash Commands. It SHALL expose typed command operations, read-only
query operations, a subscribe-only event source, and immutable public snapshots.
It MUST NOT expose the Pi Agent instance, concrete Manager/Registry/Supervisor objects,
ConfigWatch, SettingsRepository, mutable collections, or unmasked secrets.

#### Scenario: Presentation submits a command
- **WHEN** a UI needs to prompt, abort, switch Session, change project, update model
  settings, toggle a Skill, or persist a permission decision
- **THEN** it SHALL call a typed HarnessAPI command
- **AND** the command SHALL preserve the invariant-owning Application workflow

#### Scenario: Presentation reads state
- **WHEN** a UI needs Sessions, configuration, Tool catalog, Skill state, MCP state,
  Agent activity, context usage, or Tool result details
- **THEN** it SHALL call a HarnessAPI query returning an immutable snapshot
- **AND** it SHALL not receive the underlying Manager or runtime object

### Requirement: Harness implements HarnessAPI
The Application facade supplied to consumers SHALL satisfy `HarnessAPI`. Harness
internals MAY implement the facade directly or through a dedicated adapter, but
concrete Managers and mutable Runtime state SHALL remain private to Application
coordination.

#### Scenario: Harness satisfies the public port
- **WHEN** the Composition Root constructs the Application
- **THEN** it SHALL obtain a value assignable to `HarnessAPI`
- **AND** TypeScript SHALL reject access to internal Manager fields through that value

#### Scenario: UI backend receives the API
- **WHEN** TUI or Web is constructed
- **THEN** its Application dependency SHALL be typed as `HarnessAPI`
- **AND** it SHALL not require the concrete `Harness` class

### Requirement: HarnessAPI replaces TuiDeps
Both TUI and Web SHALL receive one `HarnessAPI` Application port instead of a manually
assembled dependency bag. This consolidation MUST narrow the exposed surface rather
than publishing every internal object through the interface.

#### Scenario: TUI is assembled
- **WHEN** the Composition Root selects TUI mode
- **THEN** it SHALL pass the narrow HarnessAPI and UserInteraction port wiring
- **AND** TUI SHALL not receive internal registries or stores

#### Scenario: Web is assembled
- **WHEN** the Composition Root selects Web mode
- **THEN** it SHALL pass the same HarnessAPI contract used by TUI
- **AND** Web-specific transport dependencies SHALL remain outside HarnessAPI

### Requirement: Zero `as any` casts for harness access
Presentation and Slash Command code SHALL use declared Application commands, queries,
events, and Presenter contracts. It MUST NOT use `as any`, optional method probing, or
concrete Manager access to bypass the HarnessAPI boundary.

#### Scenario: Required operation is missing
- **WHEN** Presentation needs behavior not represented by HarnessAPI
- **THEN** implementation SHALL add a narrow use-case operation or query
- **AND** it SHALL not expose a Manager or cast the Application port

#### Scenario: TypeScript compilation succeeds
- **WHEN** the migration is complete
- **THEN** TUI, Web, Eval commands, and Slash Commands SHALL compile against HarnessAPI
  without harness-access type assertions

### Requirement: HarnessAPI exposes event bus
HarnessAPI SHALL expose a subscribe-only typed Application event source. Consumers MAY
register handlers and unsubscribe, but MUST NOT emit events, clear handlers, or depend
on the concrete event-bus implementation.

#### Scenario: UI subscribes to events
- **WHEN** TUI or Web is constructed
- **THEN** it SHALL subscribe through `HarnessAPI.events.on(...)` or an equivalent
  subscribe-only contract
- **AND** event payloads SHALL use owner-defined Application/domain contracts

#### Scenario: Consumer attempts to emit
- **WHEN** code holds only a HarnessAPI reference
- **THEN** TypeScript SHALL not expose `emit()` or `clear()` on its event source

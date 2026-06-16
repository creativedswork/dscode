# harness-api Specification

## Purpose
TBD - created by archiving change code-maintainability-refactor. Update Purpose after archive.
## Requirements
### Requirement: HarnessAPI Interface Definition
The system SHALL define a `HarnessAPI` TypeScript interface that exposes the core agent capabilities consumed by UI backends and slash commands. The interface SHALL have readonly accessors for managers and mutable methods for config/state changes.

#### Scenario: HarnessAPI exposes agent
- **WHEN** a UI backend or slash command accesses `harness.agent`
- **THEN** it receives the current `Agent` instance

#### Scenario: HarnessAPI exposes managers
- **WHEN** a UI backend or slash command accesses `harness.sessionManager`, `harness.driverRegistry`, `harness.toolRegistry`, or `harness.config`
- **THEN** it receives the respective manager instances

#### Scenario: HarnessAPI exposes ImagePipeline
- **WHEN** a UI backend or MCP manager accesses `harness.imagePipeline`
- **THEN** it receives the `ImagePipeline` instance for unified image processing

#### Scenario: HarnessAPI mutation methods
- **WHEN** a slash command calls `harness.setModel(id)`, `harness.setThinking(level)`, `harness.setProvider(id)`, or `harness.updateProjectPath(cwd)`
- **THEN** the method executes the configuration change and notifies the UI via the registered onChange callback

### Requirement: Harness implements HarnessAPI
The `Harness` class SHALL implement the `HarnessAPI` interface directly. All fields currently marked `private` that are needed by UI backends SHALL be changed to `public readonly`.

#### Scenario: Harness satisfies HarnessAPI
- **WHEN** `Harness` is instantiated
- **THEN** it can be assigned to a variable of type `HarnessAPI` without type errors

#### Scenario: WebUiBackend constructor accepts HarnessAPI
- **WHEN** `new WebUiBackend({ harness, port, config })` is called
- **THEN** the `harness` parameter is typed as `HarnessAPI`, not `Harness`

#### Scenario: TuiBackend constructor accepts HarnessAPI
- **WHEN** `new TuiBackend({ harness })` is called
- **THEN** the `harness` parameter is typed as `HarnessAPI`, not the full `Harness` class

### Requirement: HarnessAPI replaces TuiDeps
The `TuiDeps` type SHALL be removed. Both `TuiBackend` and `WebUiBackend` SHALL receive a `HarnessAPI` instance via constructor. The `harness.run()` method SHALL construct backends with `{ harness: this }` instead of manually building a 20-field `TuiDeps` object.

#### Scenario: TUI path uses HarnessAPI
- **WHEN** `harness.run()` creates a `TuiBackend` for non-web mode
- **THEN** it passes `{ harness: this }` which satisfies `HarnessAPI`

#### Scenario: Web path uses HarnessAPI
- **WHEN** `main.ts` creates a `WebUiBackend` for web mode
- **THEN** it passes `{ harness, port, config }` where `harness` satisfies `HarnessAPI`

#### Scenario: TuiDeps type deleted
- **WHEN** the refactoring is complete
- **THEN** no file imports or references the `TuiDeps` type

### Requirement: Zero `as any` casts for harness access
After the refactoring, `web-backend.ts` SHALL contain zero `as any` casts used to bypass private field access on Harness. All harness fields accessed by WebUiBackend SHALL be accessible through the `HarnessAPI` interface.

#### Scenario: No as any for harness fields
- **WHEN** `WebUiBackend` needs to access `sessionManager`, `driverRegistry`, `toolRegistry`, or call `setModel`, `setThinking`, `updateProjectPath`
- **THEN** it accesses them directly via `this.harness.sessionManager`, `this.harness.setModel(...)`, etc. without any type assertion

#### Scenario: TypeScript compilation succeeds
- **WHEN** `npx tsc --noEmit` is run after refactoring
- **THEN** no type errors are emitted for harness field access in `web-backend.ts`

### Requirement: HarnessAPI exposes event bus

The `HarnessAPI` interface SHALL expose a `readonly events: HarnessEventBus` field so that consumers (UI backends, session manager, WebSocket server) can subscribe to Harness events without depending on the full `Harness` class.

#### Scenario: HarnessAPI events field is readonly

- **WHEN** a consumer accesses `harness.events`
- **THEN** it receives the `HarnessEventBus` instance
- **AND** the field is typed as `readonly events: HarnessEventBus`

#### Scenario: WebUiBackend subscribes via HarnessAPI

- **WHEN** `WebUiBackend` constructor receives `{ harness: HarnessAPI }`
- **THEN** it SHALL call `harness.events.on(...)` to subscribe to events
- **AND** TypeScript SHALL compile without errors

#### Scenario: TuiBackend subscribes via HarnessAPI

- **WHEN** `TuiBackend` constructor receives `{ harness: HarnessAPI }`
- **THEN** it SHALL call `harness.events.on(...)` to subscribe to events
- **AND** TypeScript SHALL compile without errors


## ADDED Requirements

### Requirement: UiBackend slim interface

The `UiBackend` interface SHALL be reduced to exactly 4 methods: `start()`, `waitForExit()`, `shutdown()`, and `getPromptPermission()`. All other notification concerns (streaming, tool events, system messages, config changes, MCP state) SHALL be handled via `HarnessEventBus` subscriptions.

#### Scenario: UiBackend defines only lifecycle and permission methods

- **WHEN** the `UiBackend` interface is inspected
- **THEN** it SHALL declare `start(): Promise<void>`
- **AND** `waitForExit(): Promise<void>`
- **AND** `shutdown(): Promise<void>`
- **AND** `getPromptPermission(): (toolName: string, preview: string, args: unknown) => Promise<PermissionPromptResult>`
- **AND** SHALL NOT declare any other methods

#### Scenario: UiBackend does not declare onConfigChange

- **WHEN** the `UiBackend` interface is inspected
- **THEN** `onConfigChange` SHALL NOT be a member

#### Scenario: UiBackend does not declare streaming methods

- **WHEN** the `UiBackend` interface is inspected
- **THEN** `thinkingDelta`, `textDelta`, `startAssistantMessage`, `finishAssistantMessage` SHALL NOT be members

#### Scenario: UiBackend does not declare tool methods

- **WHEN** the `UiBackend` interface is inspected
- **THEN** `toolStart`, `toolEnd` SHALL NOT be members

#### Scenario: UiBackend does not declare system message methods

- **WHEN** the `UiBackend` interface is inspected
- **THEN** `addInfo`, `addError`, `addWarning`, `addRetry`, `setProcessing` SHALL NOT be members

### Requirement: Backend constructors accept HarnessEventBus

All `UiBackend` implementations SHALL accept a `HarnessEventBus` instance in their constructor (directly or via `HarnessAPI`). They SHALL subscribe to relevant events during construction before any events are emitted.

#### Scenario: TuiBackend subscribes during construction

- **WHEN** `new TuiBackend({ harness })` is called where `harness` satisfies `HarnessAPI`
- **THEN** the constructor SHALL call `harness.events.on(...)` for all events the TUI renders
- **AND** all subscriptions SHALL be established before the constructor returns

#### Scenario: WebUiBackend subscribes during construction

- **WHEN** `new WebUiBackend({ harness, port, config })` is called where `harness` satisfies `HarnessAPI`
- **THEN** the constructor SHALL call `harness.events.on(...)` for all events the Web backend broadcasts

#### Scenario: Backend subscription order matches registration order

- **WHEN** TuiBackend and WebUiBackend are both constructed
- **THEN** each SHALL receive the same events in the same order (emit order)

### Requirement: getPromptPermission remains direct method

The `getPromptPermission()` method SHALL remain a direct interface method (not event-based) because it requires a request-response pattern: Harness calls it, and the method returns a `Promise<PermissionPromptResult>` that blocks until the user decides.

#### Scenario: getPromptPermission returns user decision

- **WHEN** `harness.ui.getPromptPermission()(toolName, preview, args)` is called
- **THEN** it SHALL return a `Promise<PermissionPromptResult>` resolved when the user makes a decision

## Purpose

Slim UiBackend interface — lifecycle + permission only; all notifications flow through HarnessEventBus.

## Requirements

### Requirement: UiBackend slim interface

The `UiBackend` interface SHALL contain lifecycle, optional interrupt handling,
and permission request-response behavior only. All streaming, Tool, Session,
configuration, MCP, and notification updates SHALL flow through HarnessAPI
events.

#### Scenario: UiBackend defines only lifecycle and permission methods

- **WHEN** the `UiBackend` interface is inspected
- **THEN** it SHALL declare `start(): Promise<void>`
- **AND** `waitForExit(): Promise<void>`
- **AND** optional `handleInterrupt(): void`
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

TUI and Web backend constructors SHALL receive narrow HarnessAPI. They SHALL
subscribe through its event source and use its commands and queries without
receiving internal Agent, Manager, Registry, or Supervisor objects.

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

`getPromptPermission()` SHALL remain a direct UserInteraction request-response
method because Application must await the user's decision. PermissionManager
MUST NOT import a concrete backend.

#### Scenario: getPromptPermission returns user decision

- **WHEN** `harness.ui.getPromptPermission()(toolName, preview, args)` is called
- **THEN** it SHALL return a `Promise<PermissionPromptResult>` resolved when the user makes a decision

### Requirement: UI backend lifecycle is assembled outside Harness

Bootstrap SHALL select and construct the concrete UI backend. Harness runtime
code SHALL remain independent of TUI and Web implementation packages.

#### Scenario: CLI starts without web flag

- **WHEN** Bootstrap selects TUI mode
- **THEN** it SHALL construct TuiBackend and connect HarnessAPI

#### Scenario: Headless Application test

- **WHEN** the Agent Host is tested without Presentation
- **THEN** it SHALL initialize with test interaction ports and no TUI/Web import
